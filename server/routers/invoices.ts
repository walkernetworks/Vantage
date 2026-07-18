/**
 * Invoice tRPC router — upload, parse, review, and apply invoices to inventory.
 *
 * Parsing pipeline (two-stage):
 *   1. Each page image is sent to Mistral OCR (mistral-ocr-latest) which returns
 *      clean, structured markdown text — far more accurate than GPT-4o vision on
 *      phone photos with glare/perspective distortion.
 *   2. The clean markdown text is passed to GPT-4o as a text-only prompt to extract
 *      structured JSON. Text → JSON is much more reliable than image → JSON.
 *   3. Every extracted row is validated server-side: item_number must match /^\d{6,7}$/.
 *      Rows that fail validation are routed to the unmatched queue — never hallucinated.
 *   4. Validated rows are matched against the catalog strictly by item_number via raw SQL.
 *   5. Unmatched rows are saved with matchStatus="unmatched" for manual review.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import sharp from "sharp";
import { Mistral } from "@mistralai/mistralai";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";
import type { MessageContent } from "../_core/llm";
import {
  createInvoice,
  saveInvoiceLines,
  listInvoices,
  getInvoiceWithLines,
  updateInvoiceLine,
  markInvoiceReviewed,
  applyInvoiceToInventory,
  toggleInvoiceLineNotReceived,
  deleteInvoice,
} from "../invoices";

// ─── Regex validator ──────────────────────────────────────────────────────────
// PFG item numbers are strictly 6–7 consecutive digits. Nothing else is valid.
const ITEM_NUMBER_RE = /^\d{6,7}$/;

// ─── Stage 2: JSON Extraction Prompt (OCR markdown text → JSON via GPT-4o) ───
const JSON_EXTRACTION_PROMPT = `You are a precise data entry automation engine. You will receive the text content of a PFG (Performance Food Group) invoice page, already extracted by OCR. Your job is to parse this text and extract EVERY SINGLE product row into structured JSON.

PFG INVOICE ROW STRUCTURE:
Each product row in a PFG invoice contains ALL of these fields on THE SAME VISUAL ROW (same line or tightly grouped lines):
  - Item Number: a 6 or 7 digit integer (e.g. 867175, 1013308)
  - Ordered: integer quantity ordered
  - Shipped: integer quantity actually delivered
  - Pack: pack count (e.g. 1, 4, 10, 20, 80, 100)
  - Size: unit size string (e.g. "5 LB", "50 CT", "32 OZ")
  - Description: product name in ALL CAPS (e.g. "PEAK FRS LEMON FRSH", "FABRIKAL LID LS636FK X SLOT CLR PE")
  - Unit Price: decimal (e.g. 16.4100)
  - Extension: line total decimal (e.g. 16.41)

⚠️ CRITICAL ALIGNMENT RULE — READ THIS CAREFULLY:
The item number and description for the SAME product ALWAYS appear on the SAME row.
DO NOT shift or offset — never pair an item number from one row with the description from the next row down.
If the OCR text appears to have columns misaligned, use the item number's position in the line to anchor which description belongs to it.
The description is the ALL-CAPS product name text that appears on the SAME line as the item number.

EXAMPLE of correct row pairing (each line = one product):
  810605  1  1  1  CS  FRST MRK STRAW 10.25 GIANT CLR 1W  62.57  62.57
  870410  1  1  1  CS  FRST MRK LID CUP PLAS X SLOT 12-24  18.32  18.32

So: itemNumber=810605 → description="FRST MRK STRAW 10.25 GIANT CLR 1W"
    itemNumber=870410 → description="FRST MRK LID CUP PLAS X SLOT 12-24"

SKIP these non-product rows:
- Category header rows (e.g. "BEIGNETS & FOOD DRY", "NA BEVERAGES", "CHEMICALS PAPER")
- Subtotal rows (contain words like "SUBTOTAL", "TOTAL", "SUB-TOTAL")
- Blank rows
- Page header/footer rows

CRITICAL RULES:
- Copy every field EXACTLY as it appears — do not alter, abbreviate, or invent values.
- If a value is missing or unclear, set it to null. NEVER hallucinate.
- itemNumber and pack are OPTIONAL — return null if not present. description and shippedQty are REQUIRED.
- The invoice header contains invoiceNumber, invoiceDate, and totalAmount — extract if present.

OUTPUT FORMAT — respond with ONLY a raw JSON object, no markdown fences, no explanation:
{
  "invoiceNumber": "8068106",
  "invoiceDate": "6/23/26",
  "totalAmount": null,
  "lines": [
    {
      "itemNumber": "867175",
      "description": "PEAK FRS LEMON FRSH",
      "pack": "1",
      "size": "5 LB",
      "orderedQty": 1,
      "shippedQty": 1,
      "unitPrice": 16.41,
      "extension": 16.41,
      "category": null
    }
  ]
}`;

// ─── Type for a single parsed page result ─────────────────────────────────────
interface PageResult {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalAmount: number | null;
  lines: Array<{
    itemNumber: string | null;
    description: string | null;
    pack: string | null;
    size: string | null;
    orderedQty: number | null;
    shippedQty: number | null;
    unitPrice: number | null;
    extension: number | null;
    category: string | null;
  }>;
}

/**
 * Stage 1: Run Mistral OCR on a base64 JPEG image.
 * Returns the raw markdown text extracted from the page, or null on failure.
 */
async function runMistralOcr(base64Jpeg: string, pageIndex: number): Promise<string | null> {
  const apiKey = ENV.mistralApiKey;
  if (!apiKey) {
    console.error("[Invoice OCR] MISTRAL_API_KEY is not set — cannot run Mistral OCR");
    return null;
  }

  const client = new Mistral({ apiKey });

  try {
    console.log(`[Invoice OCR] page ${pageIndex + 1}: calling Mistral OCR (mistral-ocr-latest)...`);
    const ocrResponse = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "image_url",
        imageUrl: `data:image/jpeg;base64,${base64Jpeg}`,
      },
    });

    // Concatenate markdown from all pages (should be just 1 for a single image)
    const markdown = ocrResponse.pages?.map((p: any) => p.markdown ?? "").join("\n\n") ?? "";
    console.log(`[Invoice OCR] page ${pageIndex + 1}: Mistral OCR complete — ${markdown.length} chars of markdown`);
    // Debug: print raw markdown so we can diagnose column alignment issues
    console.log(`[Invoice OCR] page ${pageIndex + 1} RAW MARKDOWN:\n${markdown.substring(0, 3000)}`);

    if (!markdown.trim()) {
      console.warn(`[Invoice OCR] page ${pageIndex + 1}: Mistral OCR returned empty markdown`);
      return null;
    }

    return markdown;
  } catch (err) {
    console.error(`[Invoice OCR] page ${pageIndex + 1}: Mistral OCR failed:`, err);
    return null;
  }
}

/**
 * Pre-process Mistral OCR markdown to remove rows with empty item number columns.
 *
 * PFG invoices have category header rows and continuation rows where the item
 * number column is blank. These orphaned rows confuse GPT-4o into shifting
 * item numbers to the wrong description. We strip them before extraction.
 *
 * Also removes the markdown table header/separator rows since GPT-4o doesn't
 * need them and they add noise.
 */
function preprocessMistralMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const cleaned: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Keep non-table lines (headers, page numbers, invoice metadata) as-is
    if (!trimmed.startsWith('|')) {
      cleaned.push(line);
      continue;
    }

    // Skip table separator rows (e.g. |---|---|---|
    if (/^\|[\s\-|]+\|$/.test(trimmed)) {
      continue;
    }

    // Parse the first cell (item number column)
    const cells = trimmed.split('|').map(c => c.trim());
    // cells[0] is empty (before first |), cells[1] is the item number column
    const itemNumCell = cells[1] ?? '';

    // Keep the row only if the item number cell contains a 6-7 digit number
    // OR if this is a header row (non-numeric text like "Item#", "ITEM", etc.)
    if (ITEM_NUMBER_RE.test(itemNumCell) || /^[A-Za-z#]/.test(itemNumCell)) {
      cleaned.push(line);
    }
    // Otherwise drop the row (empty item# or category header like "BEIGNETS & FOOD")
  }

  return cleaned.join('\n');
}

/**
 * Parse a single invoice page image using the two-stage pipeline:
 *   Stage 1: Mistral OCR → clean markdown text
 *   Stage 2: GPT-4o text extraction → structured JSON
 *
 * Falls back to GPT-4o vision if Mistral OCR fails or returns no text.
 * After parsing, each line's itemNumber is validated against /^\d{6,7}$/.
 * Lines that fail validation have their itemNumber set to null so they land
 * in the unmatched queue — they are never silently dropped.
 */
async function parseSinglePage(dataUrl: string, pageIndex: number): Promise<PageResult> {
  const empty: PageResult = { invoiceNumber: null, invoiceDate: null, totalAmount: null, lines: [] };

  // ── Extract base64 from data URL ──────────────────────────────────────────
  const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  const base64Data = base64Match ? base64Match[1] : null;

  // ── Stage 1: Mistral OCR ──────────────────────────────────────────────────
  let ocrMarkdown: string | null = null;
  if (base64Data) {
    ocrMarkdown = await runMistralOcr(base64Data, pageIndex);
  } else {
    console.warn(`[Invoice OCR] page ${pageIndex + 1}: could not extract base64 from data URL, skipping Mistral OCR`);
  }

  // ── Stage 2: GPT-4o JSON extraction ──────────────────────────────────────
  let response;
  try {
    if (ocrMarkdown) {
      // Pre-process: strip empty-item-number rows that cause GPT-4o to shift descriptions
      const cleanedMarkdown = preprocessMistralMarkdown(ocrMarkdown);
      console.log(`[Invoice OCR] page ${pageIndex + 1}: preprocessed markdown — ${cleanedMarkdown.length} chars (was ${ocrMarkdown.length})`);

      // Two-stage path: pass clean OCR text to GPT-4o for JSON extraction
      console.log(`[Invoice OCR] page ${pageIndex + 1}: running GPT-4o JSON extraction on OCR markdown...`);
      response = await invokeLLM({
        messages: [
          { role: "system", content: JSON_EXTRACTION_PROMPT },
          {
            role: "user",
            content: `Here is the OCR-extracted text from invoice page ${pageIndex + 1}. Extract all product rows into the JSON format specified:\n\n${cleanedMarkdown}`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4096,
      });
    } else {
      // Fallback: GPT-4o vision (original approach)
      console.warn(`[Invoice OCR] page ${pageIndex + 1}: Mistral OCR unavailable — falling back to GPT-4o vision`);
      response = await invokeLLM({
        messages: [
          { role: "system", content: JSON_EXTRACTION_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text" as const,
                text: `Extract all product rows from invoice page ${pageIndex + 1} into the JSON format specified. Copy every field verbatim — do not alter, abbreviate, or invent values.`,
              },
              {
                type: "image_url" as const,
                image_url: { url: dataUrl, detail: "high" as const },
              },
            ] as MessageContent[],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4096,
      });
    }
  } catch (err) {
    console.error(`[Invoice OCR] page ${pageIndex + 1} LLM call failed:`, err);
    return empty;
  }

  const model = (response as any).model ?? "unknown";
  const tokens = response.usage?.total_tokens ?? 0;
  console.log(`[Invoice OCR] page ${pageIndex + 1} — model: ${model}, tokens: ${tokens}`);

  const rawContent = response.choices?.[0]?.message?.content;
  if (!rawContent) {
    console.error(`[Invoice OCR] page ${pageIndex + 1}: empty response`);
    return empty;
  }

  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  console.log(`[Invoice OCR] page ${pageIndex + 1} raw length: ${content.length} chars`);

  let parsed: any;
  try {
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.error(`[Invoice OCR] page ${pageIndex + 1} JSON parse failed. Raw: ${content.substring(0, 300)}`);
    return empty;
  }

  const rawLines: any[] = Array.isArray(parsed.lines) ? parsed.lines : [];

  // ── Regex validation: filter out hallucinated item numbers ─────────────────
  let validCount = 0;
  let invalidCount = 0;
  const validatedLines = rawLines.map((line) => {
    const num = line.itemNumber != null ? String(line.itemNumber).trim() : null;
    const isValid = num !== null && ITEM_NUMBER_RE.test(num);
    if (num !== null) {
      if (isValid) validCount++;
      else {
        invalidCount++;
        console.warn(`[Invoice OCR] page ${pageIndex + 1} REJECTED item number "${num}" (failed /^\\d{6,7}$/) — routing to unmatched`);
      }
    }
    return {
      itemNumber: isValid ? num : null,
      description: typeof line.description === "string" ? line.description.trim() : null,
      pack: line.pack != null ? String(line.pack).trim() : null,
      size: typeof line.size === "string" ? line.size.trim() : null,
      orderedQty: typeof line.orderedQty === "number" ? line.orderedQty : null,
      shippedQty: typeof line.shippedQty === "number" ? line.shippedQty : null,
      unitPrice: typeof line.unitPrice === "number" ? line.unitPrice : null,
      extension: typeof line.extension === "number" ? line.extension : null,
      category: typeof line.category === "string" ? line.category : null,
    };
  });

  console.log(`[Invoice OCR] page ${pageIndex + 1}: ${rawLines.length} rows extracted, ${validCount} valid item numbers, ${invalidCount} rejected`);
  // Per-line debug: print each extracted item number + description for diagnosis
  validatedLines.forEach((l, i) => {
    const num = l.itemNumber ?? '(no number)';
    const desc = l.description ?? '(no desc)';
    console.log(`[Invoice OCR] page ${pageIndex + 1} row ${i + 1}: #${num} — ${desc}`);
  });

  return {
    invoiceNumber: typeof parsed.invoiceNumber === "string" ? parsed.invoiceNumber.trim() : null,
    invoiceDate: typeof parsed.invoiceDate === "string" ? parsed.invoiceDate.trim() : null,
    totalAmount: typeof parsed.totalAmount === "number" ? parsed.totalAmount : null,
    lines: validatedLines,
  };
}

/**
 * Parse all invoice pages SEQUENTIALLY (one at a time) and aggregate results.
 * Sequential processing prevents token-limit truncation that occurs when
 * multiple large images are processed simultaneously.
 */
async function parseInvoiceImages(imageDataUrls: string[]): Promise<PageResult> {
  const master: PageResult = {
    invoiceNumber: null,
    invoiceDate: null,
    totalAmount: null,
    lines: [],
  };

  for (let i = 0; i < imageDataUrls.length; i++) {
    console.log(`[Invoice OCR] processing page ${i + 1} of ${imageDataUrls.length} sequentially...`);
    const pageResult = await parseSinglePage(imageDataUrls[i], i);

    // Use header info from the first page that has it
    if (!master.invoiceNumber && pageResult.invoiceNumber) {
      master.invoiceNumber = pageResult.invoiceNumber;
    }
    if (!master.invoiceDate && pageResult.invoiceDate) {
      master.invoiceDate = pageResult.invoiceDate;
    }
    if (master.totalAmount === null && pageResult.totalAmount !== null) {
      master.totalAmount = pageResult.totalAmount;
    }

    // Push every line from this page into the master array
    master.lines.push(...pageResult.lines);
    console.log(`[Invoice OCR] page ${i + 1} complete: ${pageResult.lines.length} lines extracted, master total: ${master.lines.length}`);
  }

  const validLines = master.lines.filter((l) => l.itemNumber !== null).length;
  const unmatchedLines = master.lines.filter((l) => l.itemNumber === null).length;
  console.log(`[Invoice OCR] all pages done: ${master.lines.length} total rows from ${imageDataUrls.length} pages (${validLines} with valid item#, ${unmatchedLines} without)`);

  return master;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const invoicesRouter = router({
  // Upload invoice images and parse with OCR pipeline in one step (no S3 storage)
  uploadAndParse: protectedProcedure
    .input(
      z.object({
        vendor: z.string().default("PFG"),
        images: z
          .array(
            z.object({
              base64: z.string(),
              mimeType: z.string().default("image/jpeg"),
              filename: z.string().optional(),
            })
          )
          .min(1)
          .max(10),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await createInvoice({
        vendor: input.vendor,
        imageKeys: [],
        createdBy: ctx.user.id,
        notes: input.notes,
      });

      // Convert HEIC/HEIF images to JPEG before sending to Mistral OCR.
      // Mistral OCR supports JPEG, PNG, AVIF — not HEIC.
      const imageDataUrls: string[] = [];
      for (const img of input.images) {
        const isHeic = img.mimeType === 'image/heic' || img.mimeType === 'image/heif'
          || (img.filename?.toLowerCase().endsWith('.heic') ?? false)
          || (img.filename?.toLowerCase().endsWith('.heif') ?? false);
        if (isHeic) {
          try {
            console.log(`[Invoice] Converting HEIC image "${img.filename ?? 'unknown'}" to JPEG...`);
            const inputBuffer = Buffer.from(img.base64, 'base64');
            const jpegBuffer = await sharp(inputBuffer).jpeg({ quality: 92 }).toBuffer();
            imageDataUrls.push(`data:image/jpeg;base64,${jpegBuffer.toString('base64')}`);
            console.log(`[Invoice] HEIC → JPEG conversion complete (${Math.round(jpegBuffer.length / 1024)}kb)`);
          } catch (convErr) {
            console.error(`[Invoice] HEIC conversion failed for "${img.filename}", falling back to original:`, convErr);
            imageDataUrls.push(`data:${img.mimeType};base64,${img.base64}`);
          }
        } else {
          imageDataUrls.push(`data:${img.mimeType};base64,${img.base64}`);
        }
      }

      console.log(`[Invoice] Starting OCR parse for invoice ${invoice.id}, ${imageDataUrls.length} page(s), vendor: ${input.vendor}`);
      const parsed = await parseInvoiceImages(imageDataUrls);
      console.log(`[Invoice] OCR complete: ${parsed.lines.length} lines total`);

      // Normalize: shippedQty null → 0, pass orderedQty and category through
      const normalizedLines = parsed.lines.map((l) => ({
        itemNumber: l.itemNumber,
        description: l.description,
        pack: l.pack,
        size: l.size,
        orderedQty: l.orderedQty,
        shippedQty: l.shippedQty ?? 0,
        unitPrice: l.unitPrice,
        extension: l.extension,
        category: l.category,
      }));

      await saveInvoiceLines(invoice.id, normalizedLines, {
        invoiceNumber: parsed.invoiceNumber ?? undefined,
        invoiceDate: parsed.invoiceDate ?? undefined,
        totalAmount: parsed.totalAmount ?? undefined,
      });

      return {
        invoiceId: invoice.id,
        invoiceNumber: parsed.invoiceNumber,
        invoiceDate: parsed.invoiceDate,
        totalAmount: parsed.totalAmount,
        lineCount: normalizedLines.length,
      };
    }),

  list: protectedProcedure.query(async () => listInvoices()),

  getWithLines: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .query(async ({ input }) => {
      const result = await getInvoiceWithLines(input.invoiceId);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      return result;
    }),

  updateLine: protectedProcedure
    .input(
      z.object({
        lineId: z.number(),
        itemId: z.number().nullable().optional(),
        shippedQty: z.number().optional(),
        matchStatus: z.enum(["matched", "unmatched", "skipped"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      await updateInvoiceLine(input.lineId, {
        itemId: input.itemId,
        shippedQty: input.shippedQty,
        matchStatus: input.matchStatus,
      });
      return { success: true };
    }),

  markReviewed: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input }) => {
      await markInvoiceReviewed(input.invoiceId);
      return { success: true };
    }),

  toggleNotReceived: protectedProcedure
    .input(z.object({ lineId: z.number(), notReceived: z.boolean() }))
    .mutation(async ({ input }) => {
      await toggleInvoiceLineNotReceived(input.lineId, input.notReceived);
      return { success: true };
    }),

  applyDelivery: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const applied = await applyInvoiceToInventory(input.invoiceId, ctx.user.id);
      return { applied, count: applied.length };
    }),

  delete: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input }) => {
      await deleteInvoice(input.invoiceId);
      return { success: true };
    }),
});

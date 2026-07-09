/**
 * Invoice tRPC router — upload, parse, review, and apply invoices to inventory.
 *
 * Parsing pipeline:
 *   1. Each page image is sent individually to GPT-4o vision as a pure OCR task.
 *   2. The model acts as a data-entry camera: it copies text from the image verbatim.
 *   3. Every extracted row is validated server-side: item_number must match /^\d{6,7}$/.
 *      Rows that fail validation are routed to the unmatched queue — never hallucinated.
 *   4. Validated rows are matched against the catalog strictly by item_number via raw SQL.
 *   5. Unmatched rows are saved with matchStatus="unmatched" for manual review.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import sharp from "sharp";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import type { MessageContent } from "../_core/llm";
import {
  createInvoice,
  saveInvoiceLines,
  listInvoices,
  getInvoiceWithLines,
  updateInvoiceLine,
  markInvoiceReviewed,
  applyInvoiceToInventory,
  deleteInvoice,
} from "../invoices";

// ─── Regex validator ──────────────────────────────────────────────────────────
// PFG item numbers are strictly 6–7 consecutive digits. Nothing else is valid.
const ITEM_NUMBER_RE = /^\d{6,7}$/;

// ─── OCR System Prompt ────────────────────────────────────────────────────────
const PAGE_SYSTEM_PROMPT = `You are a precise data entry automation engine. Your job is to extract EVERY SINGLE row on the invoice page that contains a valid product entry.

A row is a valid product entry if it begins with a 6-digit or 7-digit numeric code on the far left column (the item number). You must iterate through the page line-by-line from the absolute top to the absolute bottom. Never skip a row that has a product number, even if it falls under a bolded category header. Extract the itemNumber, description, pack, size, shippedQty, unitPrice, and extension for every single individual row. Do not summarize or aggregate multiple rows into one.

COLUMN LAYOUT (left to right on every product row):
  Col 1: Item Number   — a 6 or 7 digit integer (e.g. 867175, 1013308)
  Col 2: Ordered       — integer quantity ordered
  Col 3: Shipped       — integer quantity actually delivered (can be 0)
  Col 4: Pack          — pack count (e.g. 1, 4, 10, 20, 80, 100)
  Col 5: Size          — unit size string (e.g. "5 LB", "50 CT", "32 OZ", "100 CT")
  Col 6: Unit          — usually blank or a unit code, often empty
  Col 7: Description   — product name text, ALL CAPS, copy verbatim
  Col 8: Price         — unit price decimal (e.g. 16.4100)
  Col 9: Extension     — line total decimal (e.g. 16.41)
  Col 10: ST           — tax flag, ignore

CRITICAL RULES:
- Iterate line-by-line from top to bottom. Do not skip any row that has a 6 or 7 digit number in Col 1.
- Copy Col 7 (Description) EXACTLY as printed — verbatim, every character (e.g. 'ALMNDBRZ MILK ALMOND BARISTA UNSWT').
- Copy Col 1 (Item Number) EXACTLY as printed — do not alter, guess, or invent digits.
- Col 3 (Shipped) is the quantity delivered. It is a whole number.
- If a value is unreadable, set it to null. NEVER invent or hallucinate values.
- itemNumber and pack are OPTIONAL — return null if unreadable. description and shippedQty are REQUIRED.
- The invoice header contains invoiceNumber, invoiceDate, and totalAmount — extract if visible.

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
 * Parse a single invoice page image.
 * After parsing, each line's itemNumber is validated against /^\d{6,7}$/.
 * Lines that fail validation have their itemNumber set to null so they land
 * in the unmatched queue — they are never silently dropped.
 */
async function parseSinglePage(dataUrl: string, pageIndex: number): Promise<PageResult> {
  const empty: PageResult = { invoiceNumber: null, invoiceDate: null, totalAmount: null, lines: [] };

  let response;
  try {
    response = await invokeLLM({
      messages: [
        { role: "system", content: PAGE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text" as const,
              text: `You are performing mechanical, literal data transcription of invoice page ${pageIndex + 1}. Do not summarize or use industry abbreviations. Look at the numbers on the far left column — if you see '593174', transcribe exactly '593174'. Look at the text column — transcribe exactly what is printed (e.g., 'ALMNDBRZ MILK ALMOND BARISTA UNSWT'). If a column is unreadable, set it to null. Never make up filler names or digits under any circumstance. Extract every row that has a 6 or 7 digit number in the first column.`,
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
  // Log length only — do not slice the content so the full payload reaches JSON.parse
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

      // Convert HEIC/HEIF images to JPEG before sending to GPT-4o.
      // GPT-4o vision only supports JPEG, PNG, GIF, and WebP — not HEIC.
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

  applyDelivery: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input }) => {
      const applied = await applyInvoiceToInventory(input.invoiceId);
      return { applied, count: applied.length };
    }),

  delete: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input }) => {
      await deleteInvoice(input.invoiceId);
      return { success: true };
    }),
});

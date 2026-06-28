/**
 * Invoice tRPC router — upload, parse, review, and apply invoices to inventory.
 * Images are passed directly to the AI as base64 data URLs — no S3 storage required.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
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

// ─── AI Invoice Parser ────────────────────────────────────────────────────────

const PAGE_SYSTEM_PROMPT = `You are a precise OCR assistant for Performance Foodservice (PFG) paper delivery invoices.
Your ONLY job is to read what is literally printed on the invoice page image. Never invent, guess, or paraphrase.

EXACT COLUMN ORDER on a PFG invoice (left to right):
  Item Number | Ordered | Shipped | Pack | Size | Unit | Description | Price | Extension | ST

Item Number is FIRST. Then Ordered qty, then Shipped qty, then Pack, then Size, then Description.

EXAMPLE ROWS (from a real PFG invoice):
  867175  | 1 | 1 | 1  | 5 LB   | | PEAK FRS LEMON FRSH                 | 16.4100 | 16.41
  158889  | 1 | 1 | 1  | 5 LB   | | WEST CRK CHEESE AMER YLW SLCD 160   | 16.4100 | 16.41
  534152  | 6 | 6 | 4  | 50 CT  | | ROYAL BOX TAKE OUT FOLDED #3 KR     | 40.7500 | 244.50
  972236  | 2 | 0 | 1  | 200 CT | | BEI BREW@BOX BEIGNET 1/2 DOZ 12X8  | 114.280 | 0.00
  1013308 | 2 | 2 | 20 | 50 CT  | | BEI BREW@CUP 20 OZ PET CLR          | 120.110 | 240.22

CATEGORY HEADER ROWS look like: "NA BEVERAGES-PRODUCE", "BEIGNETS & FOOD-DAIRY", "CHEMICALS-PAPER"
  These rows span the full width with NO item number — SKIP them.

RULES:
1. Extract EVERY row that has a 6-7 digit numeric item number in the first column.
2. SKIP category header rows and totals/subtotal rows.
3. shippedQty = 3rd column ("Shipped") — whole number, can be 0.
4. orderedQty = 2nd column ("Ordered").
5. pack = 4th column (e.g. 1, 4, 10, 20, 80, 100).
6. size = 5th column (e.g. "5 LB", "50 CT", "32 OZ").
7. description = 7th column — copy EXACTLY as printed.
8. unitPrice = 8th column. extension = 9th column.
9. If you cannot clearly read a value, use null. NEVER invent or guess.
10. invoiceNumber, invoiceDate, totalAmount: read from the invoice header if visible, else null.

Respond with ONLY a raw JSON object in this exact shape (no markdown, no explanation):
{
  "invoiceNumber": "...",
  "invoiceDate": "...",
  "totalAmount": null,
  "lines": [
    {"itemNumber":"867175","description":"PEAK FRS LEMON FRSH","pack":"1","size":"5 LB","orderedQty":1,"shippedQty":1,"unitPrice":16.41,"extension":16.41,"category":null}
  ]
}`;

/** Parse a single invoice page image and return extracted lines. */
async function parseSinglePage(dataUrl: string, pageIndex: number): Promise<{
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
}> {
  const response = await invokeLLM({
    messages: [
      { role: "system", content: PAGE_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text" as const, text: `Extract all product line items from this PFG invoice page (page ${pageIndex + 1}). Only rows with a 6-7 digit item number. Skip category headers and totals.` },
          { type: "image_url" as const, image_url: { url: dataUrl, detail: "high" as const } },
        ] as MessageContent[],
      },
    ],
    response_format: { type: "json_object" },
  });

  console.log(`[Invoice AI] page ${pageIndex + 1} model: ${(response as any).model ?? "unknown"}, tokens: ${response.usage?.total_tokens ?? 0}`);
  const rawContent = response.choices?.[0]?.message?.content;
  if (!rawContent) {
    console.error(`[Invoice AI] page ${pageIndex + 1}: no content in response`);
    return { invoiceNumber: null, invoiceDate: null, totalAmount: null, lines: [] };
  }
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  console.log(`[Invoice AI] page ${pageIndex + 1} raw (first 400): ${content.substring(0, 400)}`);

  try {
    // Strip markdown fences if model adds them despite instructions
    const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
    console.log(`[Invoice AI] page ${pageIndex + 1}: ${lines.length} lines extracted`);
    return {
      invoiceNumber: parsed.invoiceNumber ?? null,
      invoiceDate: parsed.invoiceDate ?? null,
      totalAmount: typeof parsed.totalAmount === "number" ? parsed.totalAmount : null,
      lines,
    };
  } catch (e) {
    console.error(`[Invoice AI] page ${pageIndex + 1} JSON parse failed:`, content.substring(0, 500));
    return { invoiceNumber: null, invoiceDate: null, totalAmount: null, lines: [] };
  }
}

/** Parse all invoice pages sequentially and merge results. */
async function parseInvoiceImages(imageDataUrls: string[]): Promise<{
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
}> {
  const results = await Promise.all(imageDataUrls.map((url, i) => parseSinglePage(url, i)));

  // Merge: use header fields from first page that has them; combine all lines
  const merged = {
    invoiceNumber: results.find((r) => r.invoiceNumber)?.invoiceNumber ?? null,
    invoiceDate: results.find((r) => r.invoiceDate)?.invoiceDate ?? null,
    totalAmount: results.find((r) => r.totalAmount !== null)?.totalAmount ?? null,
    lines: results.flatMap((r) => r.lines),
  };
  console.log(`[Invoice AI] merged total lines: ${merged.lines.length} from ${imageDataUrls.length} pages`);
  return merged;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const invoicesRouter = router({
  // Upload invoice images and parse with AI in one step (no S3 storage)
  uploadAndParse: protectedProcedure
    .input(
      z.object({
        vendor: z.string().default("PFG"),
        // Array of base64-encoded images (one per page)
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
      // Create invoice record first (no image storage — just metadata)
      const invoice = await createInvoice({
        vendor: input.vendor,
        imageKeys: [], // No S3 keys — images are passed directly to AI
        createdBy: ctx.user.id,
        notes: input.notes,
      });

      // Build base64 data URLs to pass directly to the AI
      const imageDataUrls = input.images.map(
        (img) => `data:${img.mimeType};base64,${img.base64}`
      );

      // Call AI to extract invoice data from the images
      console.log(`[Invoice] Starting AI parse for invoice ${invoice.id}, ${imageDataUrls.length} image(s)`);
      console.log(`[Invoice] API URL: ${process.env.BUILT_IN_FORGE_API_URL || 'not set (using OpenAI)'}, Key set: ${!!(process.env.BUILT_IN_FORGE_API_KEY || process.env.OPENAI_API_KEY)}`);
      const parsed = await parseInvoiceImages(imageDataUrls);
      console.log(`[Invoice] AI returned ${parsed.lines?.length ?? 0} lines`);

      // Save parsed lines to DB with item matching (normalize nulls)
      const normalizedLines = parsed.lines.map((l) => ({
        ...l,
        shippedQty: l.shippedQty ?? 0,
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

  // List all invoices
  list: protectedProcedure.query(async () => {
    return listInvoices();
  }),

  // Get invoice with all parsed lines
  getWithLines: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .query(async ({ input }) => {
      const result = await getInvoiceWithLines(input.invoiceId);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      return result;
    }),

  // Update a line (manual match correction or quantity fix)
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

  // Mark invoice as reviewed (user confirmed all matches)
  markReviewed: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input }) => {
      await markInvoiceReviewed(input.invoiceId);
      return { success: true };
    }),

  // Apply invoice to inventory (add shipped quantities)
  applyDelivery: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input }) => {
      const applied = await applyInvoiceToInventory(input.invoiceId);
      return { applied, count: applied.length };
    }),

  // Delete invoice and all its lines
  delete: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input }) => {
      await deleteInvoice(input.invoiceId);
      return { success: true };
    }),
});

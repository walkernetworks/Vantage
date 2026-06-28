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
  // Build image content array — pass base64 data URLs directly to the AI
  const imageContent: MessageContent[] = imageDataUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));

  const systemPrompt = `You are a precise OCR assistant for Performance Foodservice (PFG) paper delivery invoices.
Your ONLY job is to read what is literally printed on the invoice. Never invent, guess, or paraphrase anything.

EXACT COLUMN ORDER on a PFG invoice (left to right):
  Item Number | Ordered | Shipped | Pack | Size | Unit | Description | Price | Extension | ST

IMPORTANT: The columns are in this order — Item Number comes FIRST, then Ordered qty, then Shipped qty, THEN Pack and Size, THEN Description.

EXAMPLE ROWS from a real PFG invoice:
  867175  | 1 | 1 | 1  | 5 LB   |   | PEAK FRS LEMON PRSH                  | 16.4100 | 16.41
  158889  | 1 | 1 | 1  | 5 LB   |   | WEST CRK CHEESE AMER YLW SLCD 160    | 16.4100 | 16.41
  534152  | 6 | 6 | 4  | 50 CT  |   | ROYAL BOX TAKE OUT FOLDED #3 KR      | 40.7500 | 244.50
  972236  | 2 | 0 | 1  | 200 CT |   | BEI BREW@BOX BEIGNET 1/2 DOZ 12X8   | 114.280 | 0.00
  1013308 | 2 | 2 | 20 | 50 CT  |   | BEI BREW@CUP 20 OZ PET CLR           | 120.110 | 240.22

CATEGORY HEADER ROWS look like: "NA BEVERAGES-PRODUCE", "BEIGNETS & FOOD-DAIRY", "CHEMICALS-PAPER"
  These rows have NO item number — SKIP them entirely.

EXTRACTION RULES:
1. Extract EVERY row that has a numeric item number in the first column (6-7 digits). Include ALL of them, even duplicates.
2. SKIP category header rows (bold text rows with no item number).
3. SKIP the bottom totals section (SUB TOTAL, TAX, DEPOSITS, INVOICE TOTAL rows).
4. shippedQty = the THIRD column ("Shipped") — the actual quantity delivered. Can be 0 if not shipped.
5. orderedQty = the SECOND column ("Ordered").
6. pack = the FOURTH column (a number like 1, 4, 10, 20, 80, 100).
7. size = the FIFTH column (e.g. "5 LB", "50 CT", "32 OZ", "100 CT").
8. description = the SEVENTH column — copy EXACTLY as printed, do not expand abbreviations.
9. unitPrice = the EIGHTH column (Price per case).
10. extension = the NINTH column (line total = shipped * price).
11. If you cannot clearly read a value, set it to null. NEVER invent values.
12. Item numbers are 6-7 digit integers. If unclear, set itemNumber to null.
13. If multiple pages: combine ALL product rows from ALL pages into one lines array.

Return ONLY the raw JSON object — no markdown fences, no explanation text.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Extract all product line items from ${imageDataUrls.length > 1 ? `these ${imageDataUrls.length} PFG invoice pages` : "this PFG invoice page"}. Remember: only rows with a numeric item number in the first column. Skip category headers and totals.`,
          },
          ...imageContent,
        ] as MessageContent[],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "invoice_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            invoiceNumber: { type: ["string", "null"] },
            invoiceDate: { type: ["string", "null"] },
            totalAmount: { type: ["number", "null"] },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  itemNumber: { type: ["string", "null"] },
                  description: { type: ["string", "null"] },
                  pack: { type: ["string", "null"] },
                  size: { type: ["string", "null"] },
                  orderedQty: { type: ["number", "null"] },
                  shippedQty: { type: ["number", "null"] },
                  unitPrice: { type: ["number", "null"] },
                  extension: { type: ["number", "null"] },
                  category: { type: ["string", "null"] },
                },
                required: ["itemNumber", "description", "pack", "size", "orderedQty", "shippedQty", "unitPrice", "extension", "category"],
                additionalProperties: false,
              },
            },
          },
          required: ["invoiceNumber", "invoiceDate", "totalAmount", "lines"],
          // OpenAI strict mode: all properties must be in required; nullable fields use ["type","null"]
          additionalProperties: false,
        },
      },
    },
  });

  console.log("[Invoice AI] model used:", (response as any).model ?? "unknown");
  console.log("[Invoice AI] usage:", JSON.stringify(response.usage ?? {}));
  const rawContent = response.choices?.[0]?.message?.content;
  if (!rawContent) {
    console.error("[Invoice AI] No content in response. Full response:", JSON.stringify(response).substring(0, 500));
    throw new Error("No response from AI");
  }
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  console.log("[Invoice AI] raw content (first 500 chars):", content.substring(0, 500));
  try {
    const parsed = JSON.parse(content);
    console.log("[Invoice AI] parsed lines count:", parsed.lines?.length ?? 0);
    return parsed;
  } catch (e) {
    console.error("[Invoice AI] JSON parse failed. Content:", content.substring(0, 1000));
    throw new Error("Failed to parse AI response as JSON");
  }
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

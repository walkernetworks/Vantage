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
  invoiceNumber?: string;
  invoiceDate?: string;
  totalAmount?: number;
  lines: Array<{
    itemNumber?: string;
    description?: string;
    pack?: string;
    size?: string;
    orderedQty?: number;
    shippedQty: number;
    unitPrice?: number;
    extension?: number;
    category?: string;
  }>;
}> {
  // Build image content array — pass base64 data URLs directly to the AI
  const imageContent: MessageContent[] = imageDataUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));

  const systemPrompt = `You are an expert at reading Performance Foodservice (PFG) invoices.
Extract all line items from the invoice image(s) provided.

CRITICAL RULES — follow these exactly:
1. ONLY extract rows that have a numeric item number in the leftmost column (e.g. 593174, 921836, 163953). These are actual product lines.
2. SKIP all category header rows — these are rows with only a category name like "COFFEE-BEVERAGES", "NA BEVERAGES", "BEIGNETS & FOOD-DRY", etc. with no item number.
3. SKIP any totals rows, subtotal rows, tax rows, or deposit rows.
4. The "Shipped" column (second numeric column after Item Number) is the quantity actually delivered — use this for shippedQty.
5. The "Ordered" column (first numeric column after Item Number) is what was ordered — use this for orderedQty.
6. Pack and Size are separate columns — e.g. Pack="12", Size="32 OZ".
7. If multiple invoice pages are provided, combine ALL line items from ALL pages into a single lines array.
8. For the invoice header: extract Invoice Number (top right area), Date, and Invoice Total.
9. Category should be the most recent category header row above each item (e.g. "COFFEE-BEVERAGES").
10. DO NOT invent or guess items. Only return items you can actually read from the images.
11. Item numbers on PFG invoices are 5-7 digit numbers. If you cannot read a clear numeric item number, set itemNumber to null.

Return ONLY valid JSON — no markdown fences, no explanation text, just the raw JSON object.`;

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
                  description: { type: "string" },
                  pack: { type: ["string", "null"] },
                  size: { type: ["string", "null"] },
                  orderedQty: { type: ["number", "null"] },
                  shippedQty: { type: "number" },
                  unitPrice: { type: ["number", "null"] },
                  extension: { type: ["number", "null"] },
                  category: { type: ["string", "null"] },
                },
                required: ["description", "shippedQty"],
                additionalProperties: false,
              },
            },
          },
          required: ["invoiceNumber", "invoiceDate", "totalAmount", "lines"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("No response from AI");
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  try {
    return JSON.parse(content);
  } catch {
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
      const parsed = await parseInvoiceImages(imageDataUrls);

      // Save parsed lines to DB with item matching
      await saveInvoiceLines(invoice.id, parsed.lines, {
        invoiceNumber: parsed.invoiceNumber ?? undefined,
        invoiceDate: parsed.invoiceDate ?? undefined,
        totalAmount: parsed.totalAmount ?? undefined,
      });

      return {
        invoiceId: invoice.id,
        invoiceNumber: parsed.invoiceNumber,
        invoiceDate: parsed.invoiceDate,
        totalAmount: parsed.totalAmount,
        lineCount: parsed.lines.length,
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

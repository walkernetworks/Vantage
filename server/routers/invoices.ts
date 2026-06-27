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

  const systemPrompt = `You are a precise data-extraction assistant for Performance Foodservice (PFG) delivery invoices.
Your ONLY job is to read what is literally printed on the invoice image — never invent, guess, or paraphrase.

PFG INVOICE LAYOUT:
- Each product row has columns (left to right): Item Number | Description | Pack | Size | Ordered Qty | Shipped Qty | Unit Price | Extension
- Category header rows appear between product rows (e.g. "COFFEE-BEVERAGES", "NA BEVERAGES"). They have NO item number.
- The invoice header (top of page) has: Invoice Number, Date, Customer info, Invoice Total.

EXTRACTION RULES — follow exactly:
1. ONLY extract rows where the FIRST column contains a purely numeric item number (5–7 digits, e.g. 593174, 921836). These are product lines.
2. SKIP category header rows (text-only rows with no item number).
3. SKIP subtotal, tax, deposit, and total rows.
4. For shippedQty: read the "Shipped" column (the second quantity column after item number). This is the actual delivered quantity. It is a whole number like 2, 5, 12.
5. For orderedQty: read the "Ordered" column (the first quantity column after item number).
6. Copy the description EXACTLY as printed — do not paraphrase or expand abbreviations.
7. If you cannot clearly read a value, set it to null. NEVER guess or make up values.
8. Item numbers are 5–7 digit integers. If you cannot read a clear numeric item number, set itemNumber to null.
9. If multiple pages are provided, combine all product lines from all pages into one lines array.

Return ONLY the raw JSON object matching the schema — no markdown, no explanation.`;

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

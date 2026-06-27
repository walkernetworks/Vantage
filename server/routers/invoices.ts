/**
 * Invoice tRPC router — upload, parse, review, and apply invoices to inventory.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import type { MessageContent } from "../_core/llm";
import { storagePut } from "../storage";
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

async function parseInvoiceImages(imageUrls: string[]): Promise<{
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
  // Build image content array for the LLM
  const imageContent: MessageContent[] = imageUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));

  const systemPrompt = `You are an expert at reading Performance Foodservice (PFG) invoices.
Extract all line items from the invoice image(s). 

IMPORTANT RULES:
1. Only extract actual product line items — skip category header rows (rows that have only a category name like "COFFEE-BEVERAGES", "NA BEVERAGES", etc. with no item number or quantity).
2. The "Shipped" column is the quantity actually delivered — this is the key field. Use it for shippedQty.
3. The "Ordered" column is what was ordered — use it for orderedQty.
4. Pack and Size are separate columns (e.g. Pack=12, Size=32 OZ).
5. If multiple invoice pages are provided, combine all line items from all pages.
6. For the invoice header: extract Invoice Number (top right), Date, and Invoice Total.
7. Category comes from the most recent category header row above each item.

Return ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "invoiceNumber": "string or null",
  "invoiceDate": "string or null (e.g. '6/23/26')",
  "totalAmount": number or null,
  "lines": [
    {
      "itemNumber": "string or null",
      "description": "string",
      "pack": "string or null (e.g. '12')",
      "size": "string or null (e.g. '32 OZ')",
      "orderedQty": number or null,
      "shippedQty": number,
      "unitPrice": number or null,
      "extension": number or null,
      "category": "string or null"
    }
  ]
}`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `Please extract all line items from ${imageUrls.length > 1 ? `these ${imageUrls.length} invoice pages` : "this invoice"}.`,
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
  // Upload invoice images and create invoice record
  upload: protectedProcedure
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
      // Upload each image to S3
      const imageKeys: string[] = [];
      for (let i = 0; i < input.images.length; i++) {
        const img = input.images[i];
        const buffer = Buffer.from(img.base64, "base64");
        const filename = img.filename ?? `invoice-page-${i + 1}.jpg`;
        const key = `invoices/${ctx.user.id}/${Date.now()}-${filename}`;
        const { key: storedKey } = await storagePut(key, buffer, img.mimeType);
        imageKeys.push(storedKey);
      }

      // Create invoice record
      const invoice = await createInvoice({
        vendor: input.vendor,
        imageKeys,
        createdBy: ctx.user.id,
        notes: input.notes,
      });

      return { invoiceId: invoice.id };
    }),

  // Parse invoice images with AI
  parse: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input }) => {
      const result = await getInvoiceWithLines(input.invoiceId);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      const { invoice } = result;

      // Build public URLs for the stored images
      const { storageGet } = await import("../storage");
      const imageUrls: string[] = [];
      for (const key of invoice.imageKeys) {
        const { url } = await storageGet(key);
        imageUrls.push(url);
      }

      // Call AI to extract invoice data
      const parsed = await parseInvoiceImages(imageUrls);

      // Save lines to DB with item matching
      await saveInvoiceLines(input.invoiceId, parsed.lines, {
        invoiceNumber: parsed.invoiceNumber ?? undefined,
        invoiceDate: parsed.invoiceDate ?? undefined,
        totalAmount: parsed.totalAmount ?? undefined,
      });

      return {
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

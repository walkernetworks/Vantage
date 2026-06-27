/**
 * Invoice tRPC router — upload, parse, review, and apply invoices to inventory.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
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
  parseInvoiceImages,
} from "../invoices";

export const invoicesRouter = router({
  // Upload invoice images and create invoice record
  upload: protectedProcedure
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
      const imageKeys: string[] = [];
      for (let i = 0; i < input.images.length; i++) {
        const img = input.images[i];
        const buffer = Buffer.from(img.base64, "base64");
        const filename = img.filename ?? `invoice-page-${i + 1}.jpg`;
        const key = `invoices/${ctx.user.id}/${Date.now()}-${filename}`;
        const { key: storedKey } = await storagePut(key, buffer, img.mimeType);
        imageKeys.push(storedKey);
      }
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

      const { storageGet } = await import("../storage");
      const imageUrls: string[] = [];
      for (const key of result.invoice.imageKeys) {
        const { url } = await storageGet(key);
        imageUrls.push(url);
      }

      if (imageUrls.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No images found for this invoice" });
      }

      const parsed = await parseInvoiceImages(imageUrls);

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

  // Mark invoice as reviewed
  markReviewed: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input }) => {
      await markInvoiceReviewed(input.invoiceId);
      return { success: true };
    }),

  // Apply invoice delivery to inventory
  applyDelivery: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input }) => {
      const applied = await applyInvoiceToInventory(input.invoiceId);
      return { applied, count: applied.length };
    }),

  // Delete invoice and all its lines
  deleteInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input }) => {
      await deleteInvoice(input.invoiceId);
      return { success: true };
    }),
});

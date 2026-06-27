/**
 * Invoice tRPC router — upload+parse (combined), review, and apply invoices to inventory.
 *
 * Option B: Images are sent as base64 directly to the LLM — no S3 storage required.
 * The invoice header and line items are saved to the DB after AI extraction.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
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
  /**
   * Upload + Parse in one step.
   * Client sends images as base64 strings. We build data URLs and pass them
   * directly to the LLM vision model — no S3 storage needed.
   */
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
      // Build data URLs from base64 — no storage call needed
      const dataUrls = input.images.map(
        (img) => `data:${img.mimeType};base64,${img.base64}`
      );

      // Create the invoice record first (no imageKeys needed)
      const invoice = await createInvoice({
        vendor: input.vendor,
        imageKeys: [], // no stored images
        createdBy: ctx.user.id,
        notes: input.notes,
      });

      // Parse with AI using data URLs directly
      const parsed = await parseInvoiceImages(dataUrls);

      // Save extracted lines to DB
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

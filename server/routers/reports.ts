import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getWeeklyCogs,
  getInvoiceHistoryReport,
  getPriceChangeReport,
  getCountHistoryReport,
  getCountSessionDetail,
} from "../reports";

export const reportsRouter = router({
  weeklyCogs: protectedProcedure
    .input(z.object({ weeks: z.number().min(1).max(52).default(12) }))
    .query(async ({ input }) => getWeeklyCogs(input.weeks)),

  invoiceHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ input }) => getInvoiceHistoryReport(input.limit)),

  priceChanges: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(90) }))
    .query(async ({ input }) => getPriceChangeReport(input.days)),

  countHistory: protectedProcedure
    .query(async () => getCountHistoryReport()),

  countSessionDetail: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => getCountSessionDetail(input.sessionId)),
});

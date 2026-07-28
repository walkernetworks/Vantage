import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getCogsPeriods,
  getCogsDrilldown,
  getInvoiceHistoryReport,
  getPriceChangeReport,
  getCountHistoryReport,
  getCountSessionDetail,
  type CogsGrouping,
} from "../reports";

const cogsPeriodInput = z.object({
  startDate: z.string(), // ISO date string "YYYY-MM-DD"
  endDate: z.string(),   // ISO date string "YYYY-MM-DD"
  grouping: z.enum(["weekly", "monthly", "quarterly"]).default("weekly"),
});

export const reportsRouter = router({
  // COGS with custom date range + grouping
  cogsPeriods: protectedProcedure
    .input(cogsPeriodInput)
    .query(async ({ input }) => {
      const start = new Date(input.startDate + "T00:00:00");
      const end = new Date(input.endDate + "T23:59:59");
      return getCogsPeriods(start, end, input.grouping as CogsGrouping);
    }),

  // Drill-down for a specific period
  cogsDrilldown: protectedProcedure
    .input(z.object({
      periodStart: z.string(),
      periodEnd: z.string(),
    }))
    .query(async ({ input }) => {
      const start = new Date(input.periodStart + "T00:00:00");
      const end = new Date(input.periodEnd + "T23:59:59");
      return getCogsDrilldown(start, end);
    }),

  // Legacy weekly COGS (kept for backward compat)
  weeklyCogs: protectedProcedure
    .input(z.object({ weeks: z.number().min(1).max(52).default(12) }))
    .query(async ({ input }) => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - input.weeks * 7);
      return getCogsPeriods(start, end, "weekly");
    }),

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

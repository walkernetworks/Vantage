import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getCogsPeriods,
  getCogsDrilldown,
  getInvoiceHistoryReport,
  getPriceChangeReport,
  getCountHistoryReport,
  getCountSessionDetail,
  compareCountSessions,
  type CogsGrouping,
} from "../reports";
import { getDb, getRawPool } from "../db";

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

  // Price changes with legacy days param
  priceChanges: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(90) }))
    .query(async ({ input }) => getPriceChangeReport(input.days)),

  // Price changes with full custom date range
  priceChangesByRange: protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      const start = new Date(input.startDate + "T00:00:00");
      const end = new Date(input.endDate + "T23:59:59");
      await getDb();
      const pool = getRawPool();
      if (!pool) return [];
      const [rows] = await pool.promise().execute(`
        SELECT
          ph.id, ph.itemId, it.name AS itemName, it.vendor,
          CAST(ph.oldPrice AS DECIMAL(10,2)) AS oldPrice,
          CAST(ph.newPrice AS DECIMAL(10,2)) AS newPrice,
          CAST(ph.newPrice AS DECIMAL(10,2)) - CAST(ph.oldPrice AS DECIMAL(10,2)) AS diff,
          ph.importSource AS source, ph.importedAt AS changedAt
        FROM price_history ph
        JOIN items it ON it.id = ph.itemId
        WHERE ph.importedAt >= ? AND ph.importedAt <= ?
          AND CAST(ph.oldPrice AS DECIMAL(10,2)) > 0
          AND CAST(ph.newPrice AS DECIMAL(10,2)) > 0
        ORDER BY ph.importedAt DESC
        LIMIT 500
      `, [start, end]) as any;
      return (Array.isArray(rows) ? rows : []).map((r: any) => {
        const oldP = parseFloat(r.oldPrice) || 0;
        const newP = parseFloat(r.newPrice) || 0;
        return {
          id: r.id,
          itemId: r.itemId,
          itemName: r.itemName,
          vendor: r.vendor,
          oldPrice: oldP,
          newPrice: newP,
          diff: parseFloat(r.diff) || 0,
          pctChange: oldP > 0 ? ((newP - oldP) / oldP) * 100 : 0,
          changedAt: r.changedAt,
          source: r.source,
        };
      });
    }),

  countHistory: protectedProcedure
    .query(async () => getCountHistoryReport()),

  countSessionDetail: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => getCountSessionDetail(input.sessionId)),

  // Compare two count sessions side-by-side
  compareCountSessions: protectedProcedure
    .input(z.object({
      sessionIdA: z.number(),
      sessionIdB: z.number(),
    }))
    .query(async ({ input }) => compareCountSessions(input.sessionIdA, input.sessionIdB)),
});

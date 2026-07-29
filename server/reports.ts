/**
 * Reports DB helpers — Weekly COGS, Invoice History, Price Changes, Count History.
 * All queries run against the same TiDB production database.
 *
 * IMPORTANT: Always call `await getDb()` before `getRawPool()` to ensure the
 * connection pool is initialized. getRawPool() returns null until getDb() runs.
 */
import { getDb, getRawPool } from "./db";
import { invoices, invoiceLines } from "../drizzle/schema";
import { sql, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CogsGrouping = "weekly" | "monthly" | "quarterly";

export interface CogsPeriodRow {
  periodKey: string;       // e.g. "2025-W12", "2025-03", "2025-Q1"
  periodLabel: string;     // e.g. "Mar 17 – Mar 23", "March 2025", "Q1 2025"
  periodStart: string;     // ISO date string
  periodEnd: string;       // ISO date string
  openingCost: number;
  receiptsCost: number;
  closingCost: number;
  consumptionCost: number;
  invoiceCount: number;
  topItems: Array<{ name: string; cost: number }>;
}

export interface CogsDrillRow {
  itemId: number;
  itemName: string;
  vendor: string | null;
  category: string | null;
  openingQty: number;
  receiptsQty: number;
  closingQty: number;
  consumptionQty: number;
  price: number;
  consumptionCost: number;
}

export interface InvoiceHistoryRow {
  id: number;
  vendor: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  status: string;
  appliedAt: Date | null;
  lineCount: number;
  matchedCount: number;
  unmatchedCount: number;
  // Price discrepancy: matched lines where invoice unitPrice != catalog price
  priceGapCount: number;   // number of lines with a price mismatch
  priceGapAmount: number;  // total $ difference across all mismatched lines
}

export interface InvoicePriceGapRow {
  lineId: number;
  itemId: number;
  itemName: string;
  description: string | null;
  shippedQty: number;
  invoiceUnitPrice: number;
  catalogPrice: number;
  priceDiff: number;       // invoiceUnitPrice - catalogPrice
  pctChange: number;
  totalImpact: number;     // priceDiff * shippedQty
}

export interface PriceChangeRow {
  id: number;
  itemId: number;
  itemName: string;
  vendor: string | null;
  oldPrice: number;
  newPrice: number;
  diff: number;
  pctChange: number;
  changedAt: Date;
  source: string | null;
}

export interface CountHistoryRow {
  sessionId: number;
  sessionName: string | null;
  completedAt: Date | null;
  createdAt: Date;
  entryCount: number;
  totalCases: number;
  totalCost: number;
  belowParCount: number;
}

export interface CountSessionDetail {
  session: {
    id: number;
    name: string | null;
    completedAt: Date | null;
    createdAt: Date;
  };
  entries: Array<{
    itemId: number;
    itemName: string;
    vendor: string | null;
    category: string | null;
    quantity: number;
    unit: string;
    parLevel: number | null;
    price: number | null;
    totalCost: number | null;
    belowPar: boolean;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function weekLabel(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function quarterLabel(d: Date): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

/** Returns Monday of the ISO week containing d */
function weekStart(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

/** Returns Sunday of the ISO week containing d */
function weekEnd(d: Date): Date {
  const mon = weekStart(d);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return sun;
}

/** Build an array of period buckets between startDate and endDate */
function buildPeriods(startDate: Date, endDate: Date, grouping: CogsGrouping): Array<{ start: Date; end: Date; key: string; label: string }> {
  const periods: Array<{ start: Date; end: Date; key: string; label: string }> = [];

  if (grouping === "weekly") {
    let cur = weekStart(startDate);
    while (cur <= endDate) {
      const end = weekEnd(cur);
      const weekNum = getISOWeek(cur);
      periods.push({
        start: new Date(cur),
        end: new Date(end),
        key: `${cur.getFullYear()}-W${String(weekNum).padStart(2, "0")}`,
        label: weekLabel(cur, end),
      });
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 7);
    }
  } else if (grouping === "monthly") {
    let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (cur <= endDate) {
      const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59, 999);
      periods.push({
        start: new Date(cur),
        end: new Date(end),
        key: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`,
        label: monthLabel(cur),
      });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  } else {
    // quarterly
    let cur = new Date(startDate.getFullYear(), Math.floor(startDate.getMonth() / 3) * 3, 1);
    while (cur <= endDate) {
      const qEndMonth = Math.floor(cur.getMonth() / 3) * 3 + 2;
      const end = new Date(cur.getFullYear(), qEndMonth + 1, 0, 23, 59, 59, 999);
      const q = Math.floor(cur.getMonth() / 3) + 1;
      periods.push({
        start: new Date(cur),
        end: new Date(end),
        key: `${cur.getFullYear()}-Q${q}`,
        label: quarterLabel(cur),
      });
      cur = new Date(cur.getFullYear(), qEndMonth + 1, 1);
    }
  }

  return periods;
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ─── COGS Report ──────────────────────────────────────────────────────────────

export async function getCogsPeriods(
  startDate: Date,
  endDate: Date,
  grouping: CogsGrouping
): Promise<CogsPeriodRow[]> {
  await getDb(); // ensure pool is initialized
  const pool = getRawPool();
  if (!pool) return [];

  // Fetch a window slightly wider than requested to get opening stock for first period
  const fetchFrom = new Date(startDate);
  fetchFrom.setDate(fetchFrom.getDate() - 90); // look back 90 days for opening stock

  const [eventRows] = await pool.promise().execute(`
    SELECT
      se.eventType,
      se.quantityCases,
      se.eventDate,
      it.price,
      it.name AS itemName,
      it.id AS itemId,
      it.vendor,
      it.category
    FROM stock_events se
    JOIN items it ON it.id = se.itemId
    WHERE se.eventDate >= ?
      AND se.eventDate <= ?
      AND it.price IS NOT NULL AND it.price > 0
    ORDER BY se.eventDate ASC
  `, [isoDate(fetchFrom) + " 00:00:00", isoDate(endDate) + " 23:59:59"]) as any;

  const events = (Array.isArray(eventRows) ? eventRows : []) as Array<{
    eventType: string;
    quantityCases: string;
    eventDate: Date;
    price: string;
    itemName: string;
    itemId: number;
    vendor: string | null;
    category: string | null;
  }>;

  if (events.length === 0) return [];

  const periods = buildPeriods(startDate, endDate, grouping);
  const result: CogsPeriodRow[] = [];

  // Build price map (latest price per item)
  const priceByItem = new Map<number, number>();
  for (const e of events) {
    priceByItem.set(e.itemId, parseFloat(e.price) || 0);
  }

  for (const period of periods) {
    // Opening stock: last count event per item BEFORE period start
    const openingByItem = new Map<number, number>();
    for (const e of events) {
      if (e.eventType === "count" && new Date(e.eventDate) < period.start) {
        openingByItem.set(e.itemId, parseFloat(e.quantityCases) || 0);
      }
    }

    // Receipts during the period
    const receiptsByItem = new Map<number, number>();
    for (const e of events) {
      const d = new Date(e.eventDate);
      if (e.eventType === "receipt" && d >= period.start && d <= period.end) {
        receiptsByItem.set(e.itemId, (receiptsByItem.get(e.itemId) || 0) + (parseFloat(e.quantityCases) || 0));
      }
    }

    // Closing stock: last count event per item ON or BEFORE period end
    const closingByItem = new Map<number, number>();
    for (const e of events) {
      if (e.eventType === "count" && new Date(e.eventDate) <= period.end) {
        closingByItem.set(e.itemId, parseFloat(e.quantityCases) || 0);
      }
    }

    let openingCost = 0, receiptsCost = 0, closingCost = 0;
    const itemConsumption = new Map<number, { name: string; cost: number }>();

    const allItemIds = Array.from(new Set([
      ...Array.from(openingByItem.keys()),
      ...Array.from(receiptsByItem.keys()),
      ...Array.from(closingByItem.keys()),
    ]));

    for (const itemId of allItemIds) {
      const price = priceByItem.get(itemId) || 0;
      const opening = openingByItem.get(itemId) || 0;
      const receipts = receiptsByItem.get(itemId) || 0;
      const closing = closingByItem.get(itemId) || 0;
      const consumption = Math.max(0, opening + receipts - closing);

      openingCost += opening * price;
      receiptsCost += receipts * price;
      closingCost += closing * price;

      if (consumption > 0) {
        const itemName = events.find(e => e.itemId === itemId)?.itemName || `Item ${itemId}`;
        itemConsumption.set(itemId, { name: itemName, cost: consumption * price });
      }
    }

    const topItems = Array.from(itemConsumption.values())
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    result.push({
      periodKey: period.key,
      periodLabel: period.label,
      periodStart: isoDate(period.start),
      periodEnd: isoDate(period.end),
      openingCost: Math.round(openingCost * 100) / 100,
      receiptsCost: Math.round(receiptsCost * 100) / 100,
      closingCost: Math.round(closingCost * 100) / 100,
      consumptionCost: Math.round(Math.max(0, openingCost + receiptsCost - closingCost) * 100) / 100,
      invoiceCount: 0,
      topItems,
    });
  }

  return result;
}

/** Drill-down: item-level breakdown for a specific period */
export async function getCogsDrilldown(
  periodStart: Date,
  periodEnd: Date
): Promise<CogsDrillRow[]> {
  await getDb();
  const pool = getRawPool();
  if (!pool) return [];

  const fetchFrom = new Date(periodStart);
  fetchFrom.setDate(fetchFrom.getDate() - 90);

  const [eventRows] = await pool.promise().execute(`
    SELECT
      se.eventType,
      se.quantityCases,
      se.eventDate,
      it.price,
      it.name AS itemName,
      it.id AS itemId,
      it.vendor,
      it.category
    FROM stock_events se
    JOIN items it ON it.id = se.itemId
    WHERE se.eventDate >= ?
      AND se.eventDate <= ?
      AND it.price IS NOT NULL AND it.price > 0
    ORDER BY se.eventDate ASC
  `, [isoDate(fetchFrom) + " 00:00:00", isoDate(periodEnd) + " 23:59:59"]) as any;

  const events = (Array.isArray(eventRows) ? eventRows : []) as Array<{
    eventType: string;
    quantityCases: string;
    eventDate: Date;
    price: string;
    itemName: string;
    itemId: number;
    vendor: string | null;
    category: string | null;
  }>;

  if (events.length === 0) return [];

  const priceByItem = new Map<number, number>();
  const nameByItem = new Map<number, string>();
  const vendorByItem = new Map<number, string | null>();
  const categoryByItem = new Map<number, string | null>();
  for (const e of events) {
    priceByItem.set(e.itemId, parseFloat(e.price) || 0);
    nameByItem.set(e.itemId, e.itemName);
    vendorByItem.set(e.itemId, e.vendor);
    categoryByItem.set(e.itemId, e.category);
  }

  const openingByItem = new Map<number, number>();
  for (const e of events) {
    if (e.eventType === "count" && new Date(e.eventDate) < periodStart) {
      openingByItem.set(e.itemId, parseFloat(e.quantityCases) || 0);
    }
  }

  const receiptsByItem = new Map<number, number>();
  for (const e of events) {
    const d = new Date(e.eventDate);
    if (e.eventType === "receipt" && d >= periodStart && d <= periodEnd) {
      receiptsByItem.set(e.itemId, (receiptsByItem.get(e.itemId) || 0) + (parseFloat(e.quantityCases) || 0));
    }
  }

  const closingByItem = new Map<number, number>();
  for (const e of events) {
    if (e.eventType === "count" && new Date(e.eventDate) <= periodEnd) {
      closingByItem.set(e.itemId, parseFloat(e.quantityCases) || 0);
    }
  }

  const allItemIds = Array.from(new Set([
    ...Array.from(openingByItem.keys()),
    ...Array.from(receiptsByItem.keys()),
    ...Array.from(closingByItem.keys()),
  ]));

  const rows: CogsDrillRow[] = [];
  for (const itemId of allItemIds) {
    const price = priceByItem.get(itemId) || 0;
    const opening = openingByItem.get(itemId) || 0;
    const receipts = receiptsByItem.get(itemId) || 0;
    const closing = closingByItem.get(itemId) || 0;
    const consumption = Math.max(0, opening + receipts - closing);
    if (consumption === 0 && opening === 0 && receipts === 0) continue;

    rows.push({
      itemId,
      itemName: nameByItem.get(itemId) || `Item ${itemId}`,
      vendor: vendorByItem.get(itemId) ?? null,
      category: categoryByItem.get(itemId) ?? null,
      openingQty: Math.round(opening * 10000) / 10000,
      receiptsQty: Math.round(receipts * 10000) / 10000,
      closingQty: Math.round(closing * 10000) / 10000,
      consumptionQty: Math.round(consumption * 10000) / 10000,
      price,
      consumptionCost: Math.round(consumption * price * 100) / 100,
    });
  }

  return rows.sort((a, b) => b.consumptionCost - a.consumptionCost);
}

// ─── Invoice History Report ───────────────────────────────────────────────────

export async function getInvoiceHistoryReport(limit = 50): Promise<InvoiceHistoryRow[]> {
  const db = await getDb();
  if (!db) return [];
  // Compare invoice line unit prices to current catalog prices for matched lines
  const rows = await db.execute(sql`
    SELECT
      i.id, i.vendor, i.invoiceNumber, i.invoiceDate, i.status, i.createdAt,
      COUNT(il.id) AS lineCount,
      SUM(CASE WHEN il.matchStatus = 'matched' THEN 1 ELSE 0 END) AS matchedCount,
      SUM(CASE WHEN il.matchStatus = 'unmatched' THEN 1 ELSE 0 END) AS unmatchedCount,
      SUM(CASE
        WHEN il.matchStatus = 'matched'
          AND il.itemId IS NOT NULL
          AND it.price IS NOT NULL
          AND il.unitPrice IS NOT NULL
          AND ABS(CAST(il.unitPrice AS DECIMAL(10,4)) - CAST(it.price AS DECIMAL(10,4))) > 0.01
        THEN 1 ELSE 0
      END) AS priceGapCount,
      COALESCE(SUM(CASE
        WHEN il.matchStatus = 'matched'
          AND il.itemId IS NOT NULL
          AND it.price IS NOT NULL
          AND il.unitPrice IS NOT NULL
          AND ABS(CAST(il.unitPrice AS DECIMAL(10,4)) - CAST(it.price AS DECIMAL(10,4))) > 0.01
        THEN ABS(CAST(il.unitPrice AS DECIMAL(10,4)) - CAST(it.price AS DECIMAL(10,4))) * CAST(il.shippedQty AS DECIMAL(10,4))
        ELSE 0
      END), 0) AS priceGapAmount
    FROM invoices i
    LEFT JOIN invoice_lines il ON il.invoiceId = i.id
    LEFT JOIN items it ON it.id = il.itemId
    GROUP BY i.id
    ORDER BY i.createdAt DESC
    LIMIT ${limit}
  `);
  const data: any[] = ((rows as any)[0] as any[]) ?? [];
  return data.map((r: any) => ({
    id: r.id,
    vendor: r.vendor,
    invoiceNumber: r.invoiceNumber,
    invoiceDate: r.invoiceDate,
    status: r.status,
    appliedAt: r.createdAt,
    lineCount: Number(r.lineCount) || 0,
    matchedCount: Number(r.matchedCount) || 0,
    unmatchedCount: Number(r.unmatchedCount) || 0,
    priceGapCount: Number(r.priceGapCount) || 0,
    priceGapAmount: parseFloat(r.priceGapAmount) || 0,
  }));
}

// Returns line-level price discrepancies for a specific invoice
export async function getInvoicePriceGaps(invoiceId: number): Promise<InvoicePriceGapRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT
      il.id AS lineId,
      il.itemId,
      COALESCE(it.name, il.description) AS itemName,
      il.description,
      CAST(il.shippedQty AS DECIMAL(10,4)) AS shippedQty,
      CAST(il.unitPrice AS DECIMAL(10,4)) AS invoiceUnitPrice,
      CAST(it.price AS DECIMAL(10,4)) AS catalogPrice,
      CAST(il.unitPrice AS DECIMAL(10,4)) - CAST(it.price AS DECIMAL(10,4)) AS priceDiff,
      CAST(il.shippedQty AS DECIMAL(10,4)) * (CAST(il.unitPrice AS DECIMAL(10,4)) - CAST(it.price AS DECIMAL(10,4))) AS totalImpact
    FROM invoice_lines il
    JOIN items it ON it.id = il.itemId
    WHERE il.invoiceId = ${invoiceId}
      AND il.matchStatus = 'matched'
      AND il.unitPrice IS NOT NULL
      AND it.price IS NOT NULL
      AND ABS(CAST(il.unitPrice AS DECIMAL(10,4)) - CAST(it.price AS DECIMAL(10,4))) > 0.01
    ORDER BY ABS(CAST(il.unitPrice AS DECIMAL(10,4)) - CAST(it.price AS DECIMAL(10,4))) * CAST(il.shippedQty AS DECIMAL(10,4)) DESC
  `);
  const data: any[] = ((rows as any)[0] as any[]) ?? [];
  return data.map((r: any) => {
    const inv = parseFloat(r.invoiceUnitPrice) || 0;
    const cat = parseFloat(r.catalogPrice) || 0;
    const diff = parseFloat(r.priceDiff) || 0;
    return {
      lineId: r.lineId,
      itemId: r.itemId,
      itemName: r.itemName,
      description: r.description,
      shippedQty: parseFloat(r.shippedQty) || 0,
      invoiceUnitPrice: inv,
      catalogPrice: cat,
      priceDiff: diff,
      pctChange: cat > 0 ? (diff / cat) * 100 : 0,
      totalImpact: parseFloat(r.totalImpact) || 0,
    };
  });
}

// ─── Price Change Report ──────────────────────────────────────────────────────

export async function getPriceChangeReport(days = 90): Promise<PriceChangeRow[]> {
  await getDb(); // ensure pool is initialized
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
    WHERE ph.importedAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
      AND CAST(ph.oldPrice AS DECIMAL(10,2)) > 0
      AND CAST(ph.newPrice AS DECIMAL(10,2)) > 0
    ORDER BY ph.importedAt DESC
    LIMIT 200
  `, [days]) as any;

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
}

// ─── Count History Report ─────────────────────────────────────────────────────

export async function getCountHistoryReport(): Promise<CountHistoryRow[]> {
  await getDb(); // ensure pool is initialized
  const pool = getRawPool();
  if (!pool) return [];

  const [rows] = await pool.promise().execute(`
    SELECT
      cs.id AS sessionId,
      cs.name AS sessionName,
      cs.completedAt,
      cs.createdAt,
      COUNT(ce.id) AS entryCount,
      COALESCE(SUM(
        CASE WHEN it.countMode = 'each' AND it.caseQty > 1
          THEN CAST(ce.quantity AS DECIMAL(10,4)) / it.caseQty
          ELSE CAST(ce.quantity AS DECIMAL(10,4))
        END
      ), 0) AS totalCases,
      COALESCE(SUM(
        CAST(ce.quantity AS DECIMAL(10,4)) * CAST(it.price AS DECIMAL(10,2))
      ), 0) AS totalCost,
      SUM(CASE WHEN it.parLevel IS NOT NULL AND CAST(ce.quantity AS DECIMAL(10,4)) < CAST(it.parLevel AS DECIMAL(10,4)) THEN 1 ELSE 0 END) AS belowParCount
    FROM count_sessions cs
    LEFT JOIN count_entries ce ON ce.sessionId = cs.id
    LEFT JOIN items it ON it.id = ce.itemId
    WHERE cs.completedAt IS NOT NULL
    GROUP BY cs.id
    ORDER BY cs.completedAt DESC
  `) as any;

  return (Array.isArray(rows) ? rows : []).map((r: any) => ({
    sessionId: r.sessionId,
    sessionName: r.sessionName,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
    entryCount: Number(r.entryCount) || 0,
    totalCases: parseFloat(r.totalCases) || 0,
    totalCost: parseFloat(r.totalCost) || 0,
    belowParCount: Number(r.belowParCount) || 0,
  }));
}

export async function getCountSessionDetail(sessionId: number): Promise<CountSessionDetail | null> {
  await getDb(); // ensure pool is initialized
  const pool = getRawPool();
  if (!pool) return null;

  const [sessionRows] = await pool.promise().execute(
    `SELECT id, name, completedAt, createdAt FROM count_sessions WHERE id = ?`,
    [sessionId]
  ) as any;
  const session = (Array.isArray(sessionRows) ? sessionRows : [])[0];
  if (!session) return null;

  const [entryRows] = await pool.promise().execute(`
    SELECT
      ce.itemId,
      it.name AS itemName,
      it.vendor,
      it.category,
      CAST(ce.quantity AS DECIMAL(10,4)) AS quantity,
      it.countMode AS unit,
      CAST(it.parLevel AS DECIMAL(10,4)) AS parLevel,
      CAST(it.price AS DECIMAL(10,2)) AS price
    FROM count_entries ce
    JOIN items it ON it.id = ce.itemId
    WHERE ce.sessionId = ?
    ORDER BY it.category, it.name
  `, [sessionId]) as any;

  const entries = (Array.isArray(entryRows) ? entryRows : []).map((r: any) => {
    const qty = parseFloat(r.quantity) || 0;
    const price = parseFloat(r.price) || 0;
    const parLevel = r.parLevel ? parseFloat(r.parLevel) : null;
    return {
      itemId: r.itemId,
      itemName: r.itemName,
      vendor: r.vendor,
      category: r.category,
      quantity: qty,
      unit: r.unit || "case",
      parLevel,
      price: price || null,
      totalCost: price > 0 ? Math.round(qty * price * 100) / 100 : null,
      belowPar: parLevel !== null && qty < parLevel,
    };
  });

  return { session, entries };
}

// ─── Count Session Comparison ────────────────────────────────────────────────
export interface CountCompareRow {
  itemId: number;
  itemName: string;
  vendor: string | null;
  category: string | null;
  unit: string;
  parLevel: number | null;
  price: number | null;
  qtyA: number | null;   // session A quantity
  qtyB: number | null;   // session B quantity
  costA: number | null;
  costB: number | null;
  diff: number | null;   // qtyB - qtyA
  costDiff: number | null;
}

export async function compareCountSessions(
  sessionIdA: number,
  sessionIdB: number
): Promise<CountCompareRow[]> {
  await getDb();
  const pool = getRawPool();
  if (!pool) return [];

  // Fetch all items that appear in either session
  const [rows] = await pool.promise().execute(`
    SELECT
      it.id AS itemId,
      it.name AS itemName,
      it.vendor,
      it.category,
      it.countMode AS unit,
      CAST(it.parLevel AS DECIMAL(10,4)) AS parLevel,
      CAST(it.price AS DECIMAL(10,2)) AS price,
      MAX(CASE WHEN ce.sessionId = ? THEN CAST(ce.quantity AS DECIMAL(10,4)) END) AS qtyA,
      MAX(CASE WHEN ce.sessionId = ? THEN CAST(ce.quantity AS DECIMAL(10,4)) END) AS qtyB
    FROM items it
    LEFT JOIN count_entries ce ON ce.itemId = it.id AND ce.sessionId IN (?, ?)
    WHERE it.isActive = 1
    GROUP BY it.id
    HAVING qtyA IS NOT NULL OR qtyB IS NOT NULL
    ORDER BY it.category, it.name
  `, [sessionIdA, sessionIdB, sessionIdA, sessionIdB]) as any;

  return (Array.isArray(rows) ? rows : []).map((r: any) => {
    const qtyA = r.qtyA !== null ? parseFloat(r.qtyA) : null;
    const qtyB = r.qtyB !== null ? parseFloat(r.qtyB) : null;
    const price = r.price ? parseFloat(r.price) : null;
    const costA = qtyA !== null && price !== null ? Math.round(qtyA * price * 100) / 100 : null;
    const costB = qtyB !== null && price !== null ? Math.round(qtyB * price * 100) / 100 : null;
    const diff = qtyA !== null && qtyB !== null ? Math.round((qtyB - qtyA) * 10000) / 10000 : null;
    const costDiff = costA !== null && costB !== null ? Math.round((costB - costA) * 100) / 100 : null;
    return {
      itemId: r.itemId,
      itemName: r.itemName,
      vendor: r.vendor,
      category: r.category,
      unit: r.unit || "case",
      parLevel: r.parLevel ? parseFloat(r.parLevel) : null,
      price,
      qtyA,
      qtyB,
      costA,
      costB,
      diff,
      costDiff,
    };
  });
}

// Legacy wrapper kept for backward compat
export async function getWeeklyCogs(weeks = 12) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - weeks * 7);
  return getCogsPeriods(start, end, "weekly");
}

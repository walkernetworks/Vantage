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
import {
  calculateCogsPeriod,
  type CogsCountSnapshot,
  type CogsReceiptLine,
} from "./cogs";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CogsGrouping = "weekly" | "monthly" | "quarterly";

export interface CogsPeriodRow {
  periodKey: string;       // e.g. "2025-W12", "2025-03", "2025-Q1"
  periodLabel: string;     // e.g. "Mar 17 – Mar 23", "March 2025", "Q1 2025"
  periodStart: string;     // ISO date string
  periodEnd: string;       // ISO date string
  openingCost: number | null;
  receiptsCost: number;
  closingCost: number | null;
  consumptionCost: number | null;
  invoiceCount: number;
  isComplete: boolean;
  openingSessionId: number | null;
  closingSessionId: number | null;
  openingCountedAt: string | null;
  closingCountedAt: string | null;
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
  itemName: string;           // catalog item name
  catalogItemNumber: string | null;  // item number in our catalog
  invoiceItemNumber: string | null;  // item number as it appears on the invoice
  invoiceDescription: string | null; // description as it appears on the invoice
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

export function formatBusinessDate(d: Date): string {
  // Report dates represent the business day on which a count was completed.
  // Avoid UTC serialization, which moves late-evening Saturday counts to Sunday
  // when a local calendar date is sent to the client.
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoDate(d: Date): string {
  return formatBusinessDate(d);
}

export interface CountToCountPeriod {
  openingSnapshot: CogsCountSnapshot;
  closingSnapshot: CogsCountSnapshot;
}

/**
 * Pair each completed count with the prior completed count. This preserves the
 * actual operating cadence: former Sunday counts, current Saturday counts, and
 * any one-off day without imposing calendar-week boundaries.
 */
export function buildCountToCountPeriods(
  snapshots: CogsCountSnapshot[],
  startDate: Date,
  endDate: Date
): CountToCountPeriod[] {
  const ordered = [...snapshots].sort(
    (left, right) => left.completedAt.getTime() - right.completedAt.getTime()
  );
  const periods: CountToCountPeriod[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const closingSnapshot = ordered[index];
    if (closingSnapshot.completedAt < startDate || closingSnapshot.completedAt > endDate) continue;
    periods.push({ openingSnapshot: ordered[index - 1], closingSnapshot });
  }
  return periods;
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

type QueryRow = Record<string, unknown>;

function rowsFromResult<T extends QueryRow>(result: unknown): T[] {
  const rows = (result as [T[]] | undefined)?.[0];
  return Array.isArray(rows) ? rows : [];
}

function parseNumber(value: unknown): number {
  const parsed = parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Invoice dates are saved as OCR strings, so parse them without browser-dependent two-digit-year behavior. */
function invoiceReceiptDate(value: unknown, fallback: unknown): Date | null {
  const raw = typeof value === "string" ? value.trim() : "";
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const yearValue = Number(match[3]);
    const year = yearValue < 100 ? 2000 + yearValue : yearValue;
    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) return parsed;
  }
  return asDate(fallback);
}

async function loadCogsSourceData(endDate: Date): Promise<{
  snapshots: CogsCountSnapshot[];
  receiptLines: CogsReceiptLine[];
}> {
  const db = await getDb();
  if (!db) return { snapshots: [], receiptLines: [] };

  // Count entries are the authoritative record of a physical inventory count.
  const countResult = await db.execute(sql`
    SELECT
      cs.id AS sessionId,
      cs.completedAt,
      cs.createdAt AS countedAt,
      ce.itemId,
      ce.quantity,
      it.name AS itemName,
      it.vendor,
      it.category,
      it.price,
      it.caseQty,
      it.countMode
    FROM count_sessions cs
    JOIN count_entries ce ON ce.sessionId = cs.id
    JOIN items it ON it.id = ce.itemId
    WHERE cs.completedAt IS NOT NULL
      AND cs.createdAt <= ${endDate}
    ORDER BY cs.createdAt ASC, cs.id ASC
  `);
  const countRows = rowsFromResult<QueryRow>(countResult);
  const snapshotMap = new Map<number, CogsCountSnapshot>();

  for (const row of countRows) {
    const sessionId = Number(row.sessionId);
    // createdAt is the physical count’s business date. completedAt may be much
    // later when a manager finalizes a saved count session.
    const countedAt = asDate(row.countedAt);
    if (!sessionId || !countedAt) continue;

    const rawQuantity = parseNumber(row.quantity);
    const caseQty = parseNumber(row.caseQty);
    const quantityCases = row.countMode === "each" && caseQty > 1
      ? rawQuantity / caseQty
      : rawQuantity;
    const snapshot = snapshotMap.get(sessionId) ?? {
      sessionId,
      completedAt: countedAt,
      lines: [],
    };
    snapshot.lines.push({
      itemId: Number(row.itemId),
      itemName: String(row.itemName ?? `Item ${row.itemId}`),
      vendor: row.vendor == null ? null : String(row.vendor),
      category: row.category == null ? null : String(row.category),
      quantityCases,
      price: parseNumber(row.price),
    });
    snapshotMap.set(sessionId, snapshot);
  }

  // Receipts are all matched, actually received lines on every applied invoice.
  const receiptResult = await db.execute(sql`
    SELECT
      i.id AS invoiceId,
      i.invoiceDate,
      i.createdAt AS invoiceCreatedAt,
      il.itemId,
      il.shippedQty,
      il.unitPrice,
      it.price AS catalogPrice,
      it.name AS itemName,
      it.vendor,
      it.category
    FROM invoices i
    JOIN invoice_lines il ON il.invoiceId = i.id
    JOIN items it ON it.id = il.itemId
    WHERE i.status = 'applied'
      AND il.matchStatus = 'matched'
      AND il.notReceived = 0
      AND il.shippedQty > 0
  `);
  const receiptRows = rowsFromResult<QueryRow>(receiptResult);
  const receiptLines: CogsReceiptLine[] = [];
  for (const row of receiptRows) {
    const receivedAt = invoiceReceiptDate(row.invoiceDate, row.invoiceCreatedAt);
    if (!receivedAt || receivedAt > endDate) continue;
    receiptLines.push({
      invoiceId: Number(row.invoiceId),
      receivedAt,
      itemId: Number(row.itemId),
      itemName: String(row.itemName ?? `Item ${row.itemId}`),
      vendor: row.vendor == null ? null : String(row.vendor),
      category: row.category == null ? null : String(row.category),
      quantityCases: parseNumber(row.shippedQty),
      // The invoice unit price is the historical cost of this receipt.
      unitCost: parseNumber(row.unitPrice) || parseNumber(row.catalogPrice),
    });
  }

  return {
    snapshots: Array.from(snapshotMap.values()).sort(
      (left, right) => left.completedAt.getTime() - right.completedAt.getTime()
    ),
    receiptLines,
  };
}

export async function getCogsPeriods(
  startDate: Date,
  endDate: Date,
  grouping: CogsGrouping
): Promise<CogsPeriodRow[]> {
  const source = await loadCogsSourceData(endDate);
  // COGS is inherently a count-to-count calculation. Pair every consecutive
  // physical count, regardless of whether the business counted on Sunday in the
  // past or Saturday in the current workflow. A range filters by closing count.
  const snapshots = source.snapshots;
  const rows: CogsPeriodRow[] = [];
  for (const { openingSnapshot, closingSnapshot } of buildCountToCountPeriods(snapshots, startDate, endDate)) {

    // Start one millisecond after the opening count so it is selected as the
    // opening boundary while receipts remain measured from the real count time.
    const metric = calculateCogsPeriod(
      new Date(openingSnapshot.completedAt.getTime() + 1),
      closingSnapshot.completedAt,
      snapshots,
      source.receiptLines
    );
    const isComplete = metric.openingCost !== null && metric.closingCost !== null && metric.consumptionCost !== null;
    rows.push({
      periodKey: `counts-${openingSnapshot.sessionId}-${closingSnapshot.sessionId}`,
      periodLabel: `${formatBusinessDate(openingSnapshot.completedAt)} → ${formatBusinessDate(closingSnapshot.completedAt)}`,
      periodStart: isoDate(openingSnapshot.completedAt),
      periodEnd: isoDate(closingSnapshot.completedAt),
      openingCost: metric.openingCost,
      receiptsCost: metric.receiptsCost,
      closingCost: metric.closingCost,
      consumptionCost: metric.consumptionCost,
      invoiceCount: metric.receiptInvoiceIds.length,
      isComplete,
      openingSessionId: openingSnapshot.sessionId,
      closingSessionId: closingSnapshot.sessionId,
      openingCountedAt: isoDate(openingSnapshot.completedAt),
      closingCountedAt: isoDate(closingSnapshot.completedAt),
      topItems: metric.items
        .filter((item) => item.consumptionCost > 0)
        .sort((left, right) => right.consumptionCost - left.consumptionCost)
        .slice(0, 5)
        .map((item) => ({ name: item.itemName, cost: item.consumptionCost })),
    });
  }
  return rows;
}

/** Drill-down: item-level breakdown for a specific period with valid physical count boundaries. */
export async function getCogsDrilldown(
  periodStart: Date,
  periodEnd: Date,
  openingSessionId?: number,
  closingSessionId?: number
): Promise<CogsDrillRow[]> {
  const source = await loadCogsSourceData(periodEnd);
  const openingSnapshot = openingSessionId
    ? source.snapshots.find((snapshot) => snapshot.sessionId === openingSessionId)
    : null;
  const closingSnapshot = closingSessionId
    ? source.snapshots.find((snapshot) => snapshot.sessionId === closingSessionId)
    : null;
  const metric = openingSnapshot && closingSnapshot
    ? calculateCogsPeriod(
        new Date(openingSnapshot.completedAt.getTime() + 1),
        closingSnapshot.completedAt,
        source.snapshots,
        source.receiptLines
      )
    : calculateCogsPeriod(periodStart, periodEnd, source.snapshots, source.receiptLines);
  if (metric.openingCost === null || metric.closingCost === null) return [];

  return metric.items
    .filter((item) => item.openingQty !== 0 || item.receiptsQty !== 0 || item.closingQty !== 0)
    .map((item) => ({
      itemId: item.itemId,
      itemName: item.itemName,
      vendor: item.vendor,
      category: item.category,
      openingQty: item.openingQty,
      receiptsQty: item.receiptsQty,
      closingQty: item.closingQty,
      consumptionQty: item.consumptionQty,
      price: item.price,
      consumptionCost: item.consumptionCost,
    }))
    .sort((left, right) => right.consumptionCost - left.consumptionCost);
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
      it.name AS itemName,
      it.itemNumber AS catalogItemNumber,
      il.itemNumber AS invoiceItemNumber,
      il.description AS invoiceDescription,
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
      catalogItemNumber: r.catalogItemNumber ?? null,
      invoiceItemNumber: r.invoiceItemNumber ?? null,
      invoiceDescription: r.invoiceDescription ?? null,
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

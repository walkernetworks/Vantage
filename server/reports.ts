/**
 * Reports DB helpers — Weekly COGS, Invoice History, Price Changes, Count History.
 * All queries run against the same TiDB production database.
 */
import { getRawPool } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklyCogsRow {
  weekStart: string;       // ISO date string (Monday)
  weekEnd: string;         // ISO date string (Sunday)
  openingCost: number;     // $ value of opening stock
  receiptsCost: number;    // $ value of receipts (invoices applied)
  closingCost: number;     // $ value of closing stock
  consumptionCost: number; // openingCost + receiptsCost - closingCost
  invoiceCount: number;
  topItems: Array<{ name: string; cost: number }>;
}

export interface InvoiceHistoryRow {
  id: number;
  vendor: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalAmount: number | null;
  calculatedTotal: number;
  status: string;
  appliedAt: Date | null;
  lineCount: number;
  matchedCount: number;
  unmatchedCount: number;
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

// ─── Weekly COGS ──────────────────────────────────────────────────────────────

/**
 * Returns weekly COGS for the last N weeks (Mon–Sun calendar weeks).
 * Formula: Consumption = Opening Stock + Receipts − Closing Stock
 * Cost = sum(consumption_cases × unit_price) per item per week
 */
export async function getWeeklyCogs(weeks = 12): Promise<WeeklyCogsRow[]> {
  const pool = getRawPool();
  if (!pool) return [];

  // Get all stock events (counts + receipts) with item prices
  const [eventRows] = await pool.promise().execute(`
    SELECT
      se.eventType,
      se.quantityCases,
      se.eventDate,
      it.price,
      it.name AS itemName,
      it.id AS itemId
    FROM stock_events se
    JOIN items it ON it.id = se.itemId
    WHERE se.eventDate >= DATE_SUB(NOW(), INTERVAL ? WEEK)
      AND it.price IS NOT NULL AND it.price > 0
    ORDER BY se.eventDate ASC
  `, [weeks + 1]) as any;

  const events = (Array.isArray(eventRows) ? eventRows : []) as Array<{
    eventType: string;
    quantityCases: string;
    eventDate: Date;
    price: string;
    itemName: string;
    itemId: number;
  }>;

  if (events.length === 0) return [];

  // Build calendar weeks (Mon–Sun)
  const now = new Date();
  const weekRows: WeeklyCogsRow[] = [];

  for (let w = weeks - 1; w >= 0; w--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - now.getDay() + 7 - 7 * w); // Sunday
    weekEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6); // Monday
    weekStart.setHours(0, 0, 0, 0);

    // Opening stock: last count event per item BEFORE week start
    const openingByItem = new Map<number, number>(); // itemId → cases
    for (const e of events) {
      if (e.eventType === 'count' && new Date(e.eventDate) < weekStart) {
        openingByItem.set(e.itemId, parseFloat(e.quantityCases) || 0);
      }
    }

    // Receipts during the week
    const receiptsByItem = new Map<number, number>();
    let invoiceCount = 0;
    const invoiceIds = new Set<number>();
    for (const e of events) {
      const d = new Date(e.eventDate);
      if (e.eventType === 'receipt' && d >= weekStart && d <= weekEnd) {
        receiptsByItem.set(e.itemId, (receiptsByItem.get(e.itemId) || 0) + (parseFloat(e.quantityCases) || 0));
      }
    }

    // Closing stock: last count event per item BEFORE or ON week end
    const closingByItem = new Map<number, number>();
    for (const e of events) {
      if (e.eventType === 'count' && new Date(e.eventDate) <= weekEnd) {
        closingByItem.set(e.itemId, parseFloat(e.quantityCases) || 0);
      }
    }

    // Build price map
    const priceByItem = new Map<number, number>();
    for (const e of events) {
      priceByItem.set(e.itemId, parseFloat(e.price) || 0);
    }

    // Compute costs
    let openingCost = 0, receiptsCost = 0, closingCost = 0;
    const itemConsumption = new Map<number, { name: string; cost: number }>();

    const allItemIds = Array.from(new Set([...Array.from(openingByItem.keys()), ...Array.from(receiptsByItem.keys()), ...Array.from(closingByItem.keys())]));
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

    weekRows.push({
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      openingCost: Math.round(openingCost * 100) / 100,
      receiptsCost: Math.round(receiptsCost * 100) / 100,
      closingCost: Math.round(closingCost * 100) / 100,
      consumptionCost: Math.round((openingCost + receiptsCost - closingCost) * 100) / 100,
      invoiceCount,
      topItems,
    });
  }

  return weekRows;
}

// ─── Invoice History Report ───────────────────────────────────────────────────

export async function getInvoiceHistoryReport(limit = 50): Promise<InvoiceHistoryRow[]> {
  const pool = getRawPool();
  if (!pool) return [];

  const [rows] = await pool.promise().execute(`
    SELECT
      i.id, i.vendor, i.invoiceNumber, i.invoiceDate, i.totalAmount, i.status, i.createdAt,
      COALESCE(SUM(CAST(il.extension AS DECIMAL(10,2))), 0) AS calculatedTotal,
      COUNT(il.id) AS lineCount,
      SUM(CASE WHEN il.matchStatus = 'matched' THEN 1 ELSE 0 END) AS matchedCount,
      SUM(CASE WHEN il.matchStatus = 'unmatched' THEN 1 ELSE 0 END) AS unmatchedCount
    FROM invoices i
    LEFT JOIN invoice_lines il ON il.invoiceId = i.id
    GROUP BY i.id
    ORDER BY i.createdAt DESC
    LIMIT ?
  `, [limit]) as any;

  return (Array.isArray(rows) ? rows : []).map((r: any) => ({
    id: r.id,
    vendor: r.vendor,
    invoiceNumber: r.invoiceNumber,
    invoiceDate: r.invoiceDate,
    totalAmount: r.totalAmount ? parseFloat(r.totalAmount) : null,
    calculatedTotal: parseFloat(r.calculatedTotal) || 0,
    status: r.status,
    appliedAt: r.createdAt,
    lineCount: Number(r.lineCount) || 0,
    matchedCount: Number(r.matchedCount) || 0,
    unmatchedCount: Number(r.unmatchedCount) || 0,
  }));
}

// ─── Price Change Report ──────────────────────────────────────────────────────

export async function getPriceChangeReport(days = 90): Promise<PriceChangeRow[]> {
  const pool = getRawPool();
  if (!pool) return [];

  const [rows] = await pool.promise().execute(`
    SELECT
      ph.id, ph.itemId, it.name AS itemName, it.vendor,
      CAST(ph.oldPrice AS DECIMAL(10,2)) AS oldPrice,
      CAST(ph.newPrice AS DECIMAL(10,2)) AS newPrice,
      CAST(ph.newPrice AS DECIMAL(10,2)) - CAST(ph.oldPrice AS DECIMAL(10,2)) AS diff,
      ph.source, ph.changedAt
    FROM price_history ph
    JOIN items it ON it.id = ph.itemId
    WHERE ph.changedAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
      AND CAST(ph.oldPrice AS DECIMAL(10,2)) > 0
      AND CAST(ph.newPrice AS DECIMAL(10,2)) > 0
    ORDER BY ph.changedAt DESC
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
    WHERE cs.status = 'completed'
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
      unit: r.unit || 'case',
      parLevel,
      price: price || null,
      totalCost: price > 0 ? Math.round(qty * price * 100) / 100 : null,
      belowPar: parLevel !== null && qty < parLevel,
    };
  });

  return { session, entries };
}

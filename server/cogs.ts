/**
 * Pure COGS reconciliation helpers.
 *
 * A COGS period is only final when it is bounded by two physical counts:
 * the latest completed count before the period and a completed count inside
 * the period. Invoice receipts are added between those count snapshots.
 */

export interface CogsInventoryLine {
  itemId: number;
  itemName: string;
  vendor: string | null;
  category: string | null;
  quantityCases: number;
  price: number;
}

export interface CogsCountSnapshot {
  sessionId: number;
  completedAt: Date;
  lines: CogsInventoryLine[];
}

export interface CogsReceiptLine {
  invoiceId: number;
  receivedAt: Date;
  itemId: number;
  itemName: string;
  vendor: string | null;
  category: string | null;
  quantityCases: number;
  unitCost: number;
}

export interface CogsItemMetric {
  itemId: number;
  itemName: string;
  vendor: string | null;
  category: string | null;
  openingQty: number;
  receiptsQty: number;
  closingQty: number;
  consumptionQty: number;
  price: number;
  openingCost: number;
  receiptsCost: number;
  closingCost: number;
  consumptionCost: number;
}

export interface CogsPeriodMetric {
  openingSnapshot: CogsCountSnapshot | null;
  closingSnapshot: CogsCountSnapshot | null;
  receiptInvoiceIds: number[];
  receiptsCost: number;
  openingCost: number | null;
  closingCost: number | null;
  consumptionCost: number | null;
  items: CogsItemMetric[];
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function quantity(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function latestSnapshotBefore(snapshots: CogsCountSnapshot[], boundary: Date): CogsCountSnapshot | null {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index];
    if (snapshot.completedAt < boundary) return snapshot;
  }
  return null;
}

function latestSnapshotWithin(
  snapshots: CogsCountSnapshot[],
  periodStart: Date,
  periodEnd: Date
): CogsCountSnapshot | null {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index];
    if (snapshot.completedAt > periodEnd) continue;
    if (snapshot.completedAt >= periodStart) return snapshot;
    return null;
  }
  return null;
}

/**
 * Reconciles a calendar bucket using actual physical count boundaries.
 * It intentionally does not carry an old count forward as a fake closing count.
 */
export function calculateCogsPeriod(
  periodStart: Date,
  periodEnd: Date,
  snapshots: CogsCountSnapshot[],
  receiptLines: CogsReceiptLine[]
): CogsPeriodMetric {
  const orderedSnapshots = [...snapshots].sort(
    (left, right) => left.completedAt.getTime() - right.completedAt.getTime()
  );
  const openingSnapshot = latestSnapshotBefore(orderedSnapshots, periodStart);
  const closingSnapshot = latestSnapshotWithin(orderedSnapshots, periodStart, periodEnd);
  // A weekly COGS row is bounded by physical counts, not by a strict Monday–Sunday
  // invoice window. This accommodates Saturday/Sunday counts that happen just
  // before Sunday orders and includes every receipt that arrived between counts.
  const receiptWindowStart = openingSnapshot?.completedAt ?? periodStart;
  const receiptWindowEnd = closingSnapshot?.completedAt ?? periodEnd;
  const periodReceipts = receiptLines.filter(
    (receipt) => receipt.receivedAt > receiptWindowStart && receipt.receivedAt <= receiptWindowEnd
  );
  const receiptInvoiceIds = Array.from(new Set(periodReceipts.map((receipt) => receipt.invoiceId)));
  const receiptsCost = money(
    periodReceipts.reduce((sum, receipt) => sum + receipt.quantityCases * receipt.unitCost, 0)
  );

  if (!openingSnapshot || !closingSnapshot) {
    return {
      openingSnapshot,
      closingSnapshot,
      receiptInvoiceIds,
      receiptsCost,
      openingCost: null,
      closingCost: null,
      consumptionCost: null,
      items: [],
    };
  }

  const openingByItem = new Map(openingSnapshot.lines.map((line) => [line.itemId, line]));
  const closingByItem = new Map(closingSnapshot.lines.map((line) => [line.itemId, line]));
  const receiptsByItem = new Map<number, CogsReceiptLine[]>();
  for (const receipt of periodReceipts) {
    receiptsByItem.set(receipt.itemId, [...(receiptsByItem.get(receipt.itemId) ?? []), receipt]);
  }

  const itemIds = new Set<number>([
    ...Array.from(openingByItem.keys()),
    ...Array.from(closingByItem.keys()),
    ...Array.from(receiptsByItem.keys()),
  ]);

  const items: CogsItemMetric[] = [];
  for (const itemId of Array.from(itemIds)) {
    const opening = openingByItem.get(itemId);
    const closing = closingByItem.get(itemId);
    const itemReceipts = receiptsByItem.get(itemId) ?? [];
    const reference = closing ?? opening ?? itemReceipts[0];
    if (!reference) continue;

    const openingQty = opening?.quantityCases ?? 0;
    const closingQty = closing?.quantityCases ?? 0;
    const receiptsQty = itemReceipts.reduce((sum, receipt) => sum + receipt.quantityCases, 0);
    const fallbackReceiptUnitCost = itemReceipts[0]?.unitCost ?? 0;
    const openingPrice = opening?.price ?? fallbackReceiptUnitCost;
    const closingPrice = closing?.price ?? fallbackReceiptUnitCost;
    const receiptCost = itemReceipts.reduce(
      (sum, receipt) => sum + receipt.quantityCases * receipt.unitCost,
      0
    );
    const openingCost = openingQty * openingPrice;
    const closingCost = closingQty * closingPrice;
    const consumptionQty = openingQty + receiptsQty - closingQty;

    items.push({
      itemId,
      itemName: reference.itemName,
      vendor: reference.vendor,
      category: reference.category,
      openingQty: quantity(openingQty),
      receiptsQty: quantity(receiptsQty),
      closingQty: quantity(closingQty),
      consumptionQty: quantity(consumptionQty),
      price: closingPrice || openingPrice || fallbackReceiptUnitCost,
      openingCost: money(openingCost),
      receiptsCost: money(receiptCost),
      closingCost: money(closingCost),
      consumptionCost: money(openingCost + receiptCost - closingCost),
    });
  }

  return {
    openingSnapshot,
    closingSnapshot,
    receiptInvoiceIds,
    receiptsCost,
    openingCost: money(items.reduce((sum, item) => sum + item.openingCost, 0)),
    closingCost: money(items.reduce((sum, item) => sum + item.closingCost, 0)),
    consumptionCost: money(items.reduce((sum, item) => sum + item.consumptionCost, 0)),
    items,
  };
}

/** Shared math for the dashboard’s estimated stock value. */
export interface StockEstimateLine {
  price: number;
  lastCountQty: number;
  totalReceived: number;
  currentStockCases: number;
  lastCountDate: Date | null;
}

export interface CurrentStockEstimate {
  baselineCountedAt: Date | null;
  baselineValue: number;
  receiptAdjustmentValue: number;
  estimatedValue: number;
  trackedItemCount: number;
  uncountedItemCount: number;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateCurrentStockEstimate(lines: StockEstimateLine[]): CurrentStockEstimate {
  const countDates = lines
    .map((line) => line.lastCountDate)
    .filter((date): date is Date => date !== null);

  return {
    baselineCountedAt: countDates.length
      ? new Date(Math.max(...countDates.map((date) => date.getTime())))
      : null,
    baselineValue: money(lines.reduce((sum, item) => sum + item.price * item.lastCountQty, 0)),
    receiptAdjustmentValue: money(lines.reduce((sum, item) => sum + item.price * item.totalReceived, 0)),
    estimatedValue: money(lines.reduce((sum, item) => sum + item.price * item.currentStockCases, 0)),
    trackedItemCount: lines.filter((item) => item.lastCountDate !== null).length,
    uncountedItemCount: lines.filter((item) => item.lastCountDate === null).length,
  };
}

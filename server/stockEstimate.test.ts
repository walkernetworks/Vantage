import { describe, expect, it } from "vitest";
import { calculateCurrentStockEstimate } from "./stockEstimate";

describe("calculateCurrentStockEstimate", () => {
  it("adds applied receipts after the latest physical count to the dashboard’s current estimate", () => {
    const result = calculateCurrentStockEstimate([
      {
        price: 10,
        lastCountQty: 5,
        totalReceived: 2,
        currentStockCases: 7,
        lastCountDate: new Date("2026-08-08T23:12:22"),
      },
      {
        price: 4,
        lastCountQty: 3,
        totalReceived: 1,
        currentStockCases: 4,
        lastCountDate: new Date("2026-08-08T23:12:22"),
      },
    ]);

    expect(result.baselineValue).toBe(62);
    expect(result.receiptAdjustmentValue).toBe(24);
    expect(result.estimatedValue).toBe(86);
    expect(result.baselineCountedAt?.toISOString()).toBe("2026-08-08T23:12:22.000Z");
    expect(result.trackedItemCount).toBe(2);
    expect(result.uncountedItemCount).toBe(0);
  });

  it("keeps uncounted items out of the tracked estimate until a physical count exists", () => {
    const result = calculateCurrentStockEstimate([
      {
        price: 12,
        lastCountQty: 0,
        totalReceived: 0,
        currentStockCases: 0,
        lastCountDate: null,
      },
    ]);

    expect(result.estimatedValue).toBe(0);
    expect(result.baselineCountedAt).toBeNull();
    expect(result.trackedItemCount).toBe(0);
    expect(result.uncountedItemCount).toBe(1);
  });
});

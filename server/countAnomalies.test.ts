import { describe, expect, it } from "vitest";
import { detectCountAnomalies } from "./countAnomalies";

describe("count-to-count anomaly detection", () => {
  it("flags a material decrease such as 24 to 2", () => {
    const anomalies = detectCountAnomalies([
      { itemId: 1, itemName: "Example Item", previousQuantity: 24, currentQuantity: 2, unitLabel: "each" },
    ]);
    expect(anomalies).toEqual([
      expect.objectContaining({ itemId: 1, direction: "decrease", difference: 22, changePercent: 92 }),
    ]);
  });

  it("flags a material increase such as 12 to 20", () => {
    const anomalies = detectCountAnomalies([
      { itemId: 1, itemName: "Example Increase", previousQuantity: 12, currentQuantity: 20, unitLabel: "cases" },
    ]);
    expect(anomalies).toEqual([
      expect.objectContaining({ itemId: 1, direction: "increase", difference: 8, changePercent: 67 }),
    ]);
  });

  it("does not flag normal increases, small changes, or a one-to-zero count", () => {
    const anomalies = detectCountAnomalies([
      { itemId: 1, itemName: "Increase", previousQuantity: 12, currentQuantity: 15, unitLabel: "cases" },
      { itemId: 2, itemName: "Small decrease", previousQuantity: 12, currentQuantity: 7, unitLabel: "cases" },
      { itemId: 3, itemName: "One to zero", previousQuantity: 1, currentQuantity: 0, unitLabel: "each" },
    ]);
    expect(anomalies).toEqual([]);
  });
});

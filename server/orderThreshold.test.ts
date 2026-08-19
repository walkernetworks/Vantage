import { describe, expect, it } from "vitest";
import { getOrderTrigger, normalizeOrderThresholdPercent } from "./orderThreshold";

describe("normalizeOrderThresholdPercent", () => {
  it("treats legacy fractional 0.50 values as 50% of par", () => {
    expect(normalizeOrderThresholdPercent("0.50")).toBe(50);
  });

  it("keeps percentage values and defaults blank thresholds to 50%", () => {
    expect(normalizeOrderThresholdPercent("70")).toBe(70);
    expect(normalizeOrderThresholdPercent(null)).toBe(50);
  });

  it("flags the Peach Mango count-only stock level against its intended half-par trigger", () => {
    const currentCases = 1 / 6; // One each from the Aug. 15 count; six per case.
    const parCases = 1;
    const triggerCases = parCases * normalizeOrderThresholdPercent("0.50") / 100;
    expect(currentCases).toBeLessThanOrEqual(triggerCases);
  });

  it("returns a visible trigger for both default and custom threshold settings", () => {
    expect(getOrderTrigger(4, null)).toEqual({
      orderThresholdPercent: 50,
      orderTriggerCases: 2,
      usesDefaultThreshold: true,
    });
    expect(getOrderTrigger(8, "70")).toEqual({
      orderThresholdPercent: 70,
      orderTriggerCases: 5.6,
      usesDefaultThreshold: false,
    });
  });
});

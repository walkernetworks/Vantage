import { describe, expect, it } from "vitest";
import { normalizeOrderThresholdPercent } from "./orderThreshold";

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
});

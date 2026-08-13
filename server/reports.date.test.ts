import { describe, expect, it } from "vitest";
import { buildCountToCountPeriods, formatBusinessDate } from "./reports";

describe("formatBusinessDate", () => {
  it("preserves a late Saturday physical count as Saturday rather than shifting it through UTC", () => {
    const saturdayCount = new Date(2026, 7, 8, 23, 12, 22);

    expect(formatBusinessDate(saturdayCount)).toBe("2026-08-08");
  });
});

describe("buildCountToCountPeriods", () => {
  const snapshots = [
    { sessionId: 1, completedAt: new Date(2026, 6, 19, 20), lines: [] }, // Sunday
    { sessionId: 2, completedAt: new Date(2026, 6, 25, 20), lines: [] }, // Saturday
    { sessionId: 3, completedAt: new Date(2026, 7, 1, 20), lines: [] },  // Saturday
  ];

  it("forms a valid period when the cadence shifts from Sunday to Saturday", () => {
    const periods = buildCountToCountPeriods(snapshots, new Date(2026, 6, 1), new Date(2026, 6, 31, 23, 59));

    expect(periods).toHaveLength(1);
    expect(periods[0].openingSnapshot.sessionId).toBe(1);
    expect(periods[0].closingSnapshot.sessionId).toBe(2);
  });

  it("forms a valid period between consecutive Saturday counts", () => {
    const periods = buildCountToCountPeriods(snapshots, new Date(2026, 7, 1), new Date(2026, 7, 8, 23, 59));

    expect(periods).toHaveLength(1);
    expect(periods[0].openingSnapshot.sessionId).toBe(2);
    expect(periods[0].closingSnapshot.sessionId).toBe(3);
  });
});

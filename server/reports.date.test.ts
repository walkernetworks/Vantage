import { describe, expect, it } from "vitest";
import { formatBusinessDate } from "./reports";

describe("formatBusinessDate", () => {
  it("preserves a late Saturday physical count as Saturday rather than shifting it through UTC", () => {
    const saturdayCount = new Date(2026, 7, 8, 23, 12, 22);

    expect(formatBusinessDate(saturdayCount)).toBe("2026-08-08");
  });
});

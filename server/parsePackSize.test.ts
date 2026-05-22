import { describe, it, expect } from "vitest";
import { parsePackSizeQty } from "./db";

describe("parsePackSizeQty", () => {
  // ── Size units: first number is case qty ─────────────────────────────────────
  it("12/750 ML → 12 bottles", () => expect(parsePackSizeQty("12/750 ML")).toBe(12));
  it("6/6oz → 6", () => expect(parsePackSizeQty("6/6oz")).toBe(6));
  it("4/6/12 OZ → 24 (3-segment size)", () => expect(parsePackSizeQty("4/6/12 OZ")).toBe(24));

  // ── PK unit: multiply all (count by individual unit) ─────────────────────────
  it("2/12 PK → 24 individual cans/bottles", () => expect(parsePackSizeQty("2/12 PK")).toBe(24));

  // ── CT/EA: first=1 → use second number ───────────────────────────────────────
  it("1/100 CT → 100 (single-pack)", () => expect(parsePackSizeQty("1/100 CT")).toBe(100));
  it("1/1000 CT → 1000 (single-pack)", () => expect(parsePackSizeQty("1/1000 CT")).toBe(1000));
  it("1/12 CT → 12 (single-pack)", () => expect(parsePackSizeQty("1/12 CT")).toBe(12));
  it("1/250 CT → 250 (single-pack)", () => expect(parsePackSizeQty("1/250 CT")).toBe(250));
  it("1/1 CT → 1 (single unit)", () => expect(parsePackSizeQty("1/1 CT")).toBe(1));

  // ── CT/EA: first>1 → use first number (outer pack count) ─────────────────────
  it("10/100 CT → 10 boxes per case (gloves, lids)", () => expect(parsePackSizeQty("10/100 CT")).toBe(10));
  it("16/135 CT → 16 rolls per case (paper towels)", () => expect(parsePackSizeQty("16/135 CT")).toBe(16));
  it("20/30 CT → 20 sleeves per case (cups)", () => expect(parsePackSizeQty("20/30 CT")).toBe(20));
  it("4/300 CT → 4 boxes per case (straws)", () => expect(parsePackSizeQty("4/300 CT")).toBe(4));
  it("4/250 CT → 4 boxes per case (gloves)", () => expect(parsePackSizeQty("4/250 CT")).toBe(4));
  it("6/720 CT → 6 packs per case (napkins)", () => expect(parsePackSizeQty("6/720 CT")).toBe(6));
  it("10/10 CT → 10 packs per case (can liners)", () => expect(parsePackSizeQty("10/10 CT")).toBe(10));
  it("12/25 CT → 12 sleeves per case (cups)", () => expect(parsePackSizeQty("12/25 CT")).toBe(12));
  it("3/10 CT → 3 rolls per case (register rolls)", () => expect(parsePackSizeQty("3/10 CT")).toBe(3));

  // ── Webstaurant leading dash ──────────────────────────────────────────────────
  it("- 25/Case → 25", () => expect(parsePackSizeQty("- 25/Case")).toBe(25));

  // ── Standalone count ──────────────────────────────────────────────────────────
  it("100 CT → 100", () => expect(parsePackSizeQty("100 CT")).toBe(100));
  it("24 EA → 24", () => expect(parsePackSizeQty("24 EA")).toBe(24));

  // ── Null / empty ──────────────────────────────────────────────────────────────
  it("null → null", () => expect(parsePackSizeQty(null)).toBeNull());
  it("empty string → null", () => expect(parsePackSizeQty("")).toBeNull());
});

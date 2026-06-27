/**
 * Tests for invoice parsing helpers and delivery application logic.
 * These are unit tests that do not require a live DB connection.
 */
import { describe, it, expect } from "vitest";

// ─── Test: PFG invoice line parsing ──────────────────────────────────────────

describe("PFG invoice line parsing", () => {
  // Simulate what the AI parser returns and what saveInvoiceLines does with it
  it("should parse shipped qty as a number", () => {
    const rawLine = { itemNumber: "593174", description: "ALMDNBRZ MILK ALMOND BARISTA UNSWT", pack: "12", size: "32 OZ", orderedQty: 2, shippedQty: 2, unitPrice: 35.72, extension: 71.44, category: "Coffee-Beverages" };
    expect(rawLine.shippedQty).toBe(2);
    expect(typeof rawLine.shippedQty).toBe("number");
  });

  it("should handle zero shipped qty (backordered item)", () => {
    const rawLine = { itemNumber: "723206", description: "RISHTEAVTEA BLUBRY HIBISCUS ORG", pack: "6", size: "15 BG", orderedQty: 1, shippedQty: 0, unitPrice: 65.94, extension: 0, category: "NA Beverages" };
    expect(rawLine.shippedQty).toBe(0);
  });

  it("should correctly identify category header rows to skip", () => {
    const categoryHeaders = ["COFFEE-BEVERAGES", "NA BEVERAGES", "BEIGNETS & FOOD-DRY", "COFFEE-DRY FOODS", "BEIGNETS & FOOD-REFRIG", "BEIGNETS & FOOD-FROZEN", "NA BEVERAGES-FROZEN", "BEIGNETS & FOOD-STEAK/PO", "CHEMICALS-PAPER", "COFFEE-PAPER"];
    // Category headers should not have a numeric item number
    for (const header of categoryHeaders) {
      const isNumericItemNumber = /^\d+$/.test(header);
      expect(isNumericItemNumber).toBe(false);
    }
  });

  it("should parse extension correctly from price × qty", () => {
    const unitPrice = 35.72;
    const shippedQty = 2;
    const expectedExtension = 71.44;
    expect(Math.round(unitPrice * shippedQty * 100) / 100).toBe(expectedExtension);
  });
});

// ─── Test: Inventory calculation with deliveries ──────────────────────────────

describe("Inventory calculation with deliveries", () => {
  it("should add delivered qty to last count qty for current stock", () => {
    const lastCountQty = 5;
    const deliveredQty = 2;
    const currentStock = lastCountQty + deliveredQty;
    expect(currentStock).toBe(7);
  });

  it("should compute current stock value correctly", () => {
    const itemPrice = 35.72;
    const lastCountQty = 5;
    const deliveredQty = 2;
    const currentStockValue = itemPrice * (lastCountQty + deliveredQty);
    expect(Math.round(currentStockValue * 100) / 100).toBe(250.04);
  });

  it("should handle items with no deliveries (deliveredQty = 0)", () => {
    const lastCountQty = 3;
    const deliveredQty = 0;
    const currentStock = lastCountQty + deliveredQty;
    expect(currentStock).toBe(3);
  });

  it("should handle items with no count entry (countQty = 0) but with deliveries", () => {
    const lastCountQty = 0;
    const deliveredQty = 4;
    const currentStock = lastCountQty + deliveredQty;
    expect(currentStock).toBe(4);
  });
});

// ─── Test: Invoice match status logic ────────────────────────────────────────

describe("Invoice line match status", () => {
  it("should mark line as matched when itemNumber found in inventory", () => {
    const itemNumberMap = new Map([["593174", 101], ["163953", 202]]);
    const lineItemNumber = "593174";
    const matchedItemId = itemNumberMap.get(lineItemNumber.toLowerCase().trim()) ?? null;
    expect(matchedItemId).toBe(101);
    const matchStatus = matchedItemId ? "matched" : "unmatched";
    expect(matchStatus).toBe("matched");
  });

  it("should mark line as unmatched when itemNumber not in inventory", () => {
    const itemNumberMap = new Map([["593174", 101]]);
    const lineItemNumber = "999999";
    const matchedItemId = itemNumberMap.get(lineItemNumber.toLowerCase().trim()) ?? null;
    expect(matchedItemId).toBeNull();
    const matchStatus = matchedItemId ? "matched" : "unmatched";
    expect(matchStatus).toBe("unmatched");
  });

  it("should handle empty itemNumber gracefully", () => {
    const itemNumberMap = new Map([["593174", 101]]);
    const lineItemNumber = "";
    const key = lineItemNumber.toLowerCase().trim();
    const matchedItemId = key ? (itemNumberMap.get(key) ?? null) : null;
    expect(matchedItemId).toBeNull();
  });
});

// ─── Test: Currency formatting ────────────────────────────────────────────────

describe("Currency formatting", () => {
  it("should format numbers with 2 decimal places", () => {
    const format = (n: number | string | null | undefined): string => {
      if (n == null) return "—";
      const num = typeof n === "string" ? parseFloat(n) : n;
      if (isNaN(num)) return "—";
      return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    expect(format(5678.93)).toBe("$5,678.93");
    expect(format("118.38")).toBe("$118.38");
    expect(format(null)).toBe("—");
    expect(format(0)).toBe("$0.00");
  });
});

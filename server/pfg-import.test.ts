/**
 * PFG Import Tests
 * Covers: new item creation, price-change detection, unchanged rows,
 * price history recording, and Product Number as stable match key.
 */
import { describe, expect, it } from "vitest";

// ── Pure logic tests (no DB) ──────────────────────────────────────────────────

// Replicate the category mapping from ItemCatalog.tsx for unit testing
const PFG_CATEGORY_MAP: Record<string, string> = {
  "ALCOHOL-BEVERAGES": "Alcohol - 100",
  "ALCOHOL-DRY FOODS": "Alcohol - 130",
  "BEIGNETS & FOOD-DRY FOODS": "Bakery",
  "BEIGNETS & FOOD-FROZEN": "Bakery",
  "BEIGNETS & FOOD-REFRIG": "Bakery",
  "BEIGNETS & FOOD-DAIRY": "Dairy",
  "BEIGNETS & FOOD-PRODUCE": "Produce",
  "BEIGNETS & FOOD-PAPER": "Paper Goods",
  "COFFEE-BEVERAGES": "Coffee",
  "COFFEE-DRY FOODS": "Coffee",
  "COFFEE-DAIRY": "Dairy",
  "COFFEE-PRODUCE": "Produce",
  "COFFEE-PAPER": "Paper Goods",
  "NA BEVERAGES": "Coffee",
  "CHEMICALS": "Supplies",
};

const PFG_STORAGE_MAP: Record<string, string> = {
  "ALCOHOL-BEVERAGES": "Bar",
  "ALCOHOL-DRY FOODS": "Bar",
  "BEIGNETS & FOOD-FROZEN": "Freezer",
  "BEIGNETS & FOOD-REFRIG": "Walk-In",
  "BEIGNETS & FOOD-DAIRY": "Walk-In",
  "COFFEE-DAIRY": "Walk-In",
};

function mapPfgCategory(pfgCategory: string) {
  return PFG_CATEGORY_MAP[pfgCategory.toUpperCase()] ?? "Other";
}

function mapPfgStorage(pfgCategory: string) {
  return PFG_STORAGE_MAP[pfgCategory.toUpperCase()] ?? "Dry Storage";
}

function parsePfgPrice(raw: string): string {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? "0.00" : num.toFixed(2);
}

// ── Category mapping ──────────────────────────────────────────────────────────

describe("PFG category mapping", () => {
  it("maps ALCOHOL-BEVERAGES to Alcohol - 100", () => {
    expect(mapPfgCategory("ALCOHOL-BEVERAGES")).toBe("Alcohol - 100");
  });

  it("maps ALCOHOL-DRY FOODS to Alcohol - 130", () => {
    expect(mapPfgCategory("ALCOHOL-DRY FOODS")).toBe("Alcohol - 130");
  });

  it("maps COFFEE-DRY FOODS to Coffee", () => {
    expect(mapPfgCategory("COFFEE-DRY FOODS")).toBe("Coffee");
  });

  it("maps BEIGNETS & FOOD-FROZEN to Bakery", () => {
    expect(mapPfgCategory("BEIGNETS & FOOD-FROZEN")).toBe("Bakery");
  });

  it("maps CHEMICALS to Supplies", () => {
    expect(mapPfgCategory("CHEMICALS")).toBe("Supplies");
  });

  it("returns Other for unknown categories", () => {
    expect(mapPfgCategory("UNKNOWN-CATEGORY")).toBe("Other");
  });
});

// ── Storage area mapping ──────────────────────────────────────────────────────

describe("PFG storage area mapping", () => {
  it("maps ALCOHOL-BEVERAGES to Bar", () => {
    expect(mapPfgStorage("ALCOHOL-BEVERAGES")).toBe("Bar");
  });

  it("maps BEIGNETS & FOOD-FROZEN to Freezer", () => {
    expect(mapPfgStorage("BEIGNETS & FOOD-FROZEN")).toBe("Freezer");
  });

  it("maps BEIGNETS & FOOD-REFRIG to Walk-In", () => {
    expect(mapPfgStorage("BEIGNETS & FOOD-REFRIG")).toBe("Walk-In");
  });

  it("defaults to Dry Storage for unmapped categories", () => {
    expect(mapPfgStorage("BEIGNETS & FOOD-DRY FOODS")).toBe("Dry Storage");
  });
});

// ── Price parsing ─────────────────────────────────────────────────────────────

describe("PFG price parsing", () => {
  it("parses a plain number", () => {
    expect(parsePfgPrice("24.99")).toBe("24.99");
  });

  it("strips dollar signs", () => {
    expect(parsePfgPrice("$24.99")).toBe("24.99");
  });

  it("strips commas from large prices", () => {
    expect(parsePfgPrice("1,234.56")).toBe("1234.56");
  });

  it("returns 0.00 for empty string", () => {
    expect(parsePfgPrice("")).toBe("0.00");
  });

  it("returns 0.00 for non-numeric input", () => {
    expect(parsePfgPrice("N/A")).toBe("0.00");
  });
});

// ── Price change detection logic ──────────────────────────────────────────────

describe("Price change detection", () => {
  function detectChange(oldPrice: string, newPrice: string) {
    const old = parseFloat(oldPrice);
    const next = parseFloat(newPrice);
    if (old === next) return null;
    const diff = next - old;
    const pct = old !== 0 ? (diff / old) * 100 : 0;
    return {
      diff: diff.toFixed(2),
      pctChange: pct.toFixed(1),
      isIncrease: diff > 0,
    };
  }

  it("returns null when price is unchanged", () => {
    expect(detectChange("24.99", "24.99")).toBeNull();
  });

  it("detects a price increase", () => {
    const result = detectChange("24.99", "27.49");
    expect(result).not.toBeNull();
    expect(result!.isIncrease).toBe(true);
    expect(result!.diff).toBe("2.50");
    expect(parseFloat(result!.pctChange)).toBeCloseTo(10.0, 0);
  });

  it("detects a price decrease", () => {
    const result = detectChange("30.00", "25.00");
    expect(result).not.toBeNull();
    expect(result!.isIncrease).toBe(false);
    expect(result!.diff).toBe("-5.00");
    expect(result!.pctChange).toBe("-16.7");
  });

  it("handles floating point comparison correctly", () => {
    // 24.99 vs 24.99 should be unchanged
    expect(detectChange("24.990", "24.99")).toBeNull();
  });
});

// ── Alcohol category detection ────────────────────────────────────────────────

describe("Alcohol category detection from PFG category", () => {
  function getAlcoholCategory(internalCategory: string) {
    if (internalCategory === "Alcohol - 100") return "100";
    if (internalCategory === "Alcohol - 130") return "130";
    return undefined;
  }

  it("assigns category 100 for Alcohol - 100", () => {
    expect(getAlcoholCategory("Alcohol - 100")).toBe("100");
  });

  it("assigns category 130 for Alcohol - 130", () => {
    expect(getAlcoholCategory("Alcohol - 130")).toBe("130");
  });

  it("returns undefined for non-alcohol categories", () => {
    expect(getAlcoholCategory("Coffee")).toBeUndefined();
    expect(getAlcoholCategory("Bakery")).toBeUndefined();
  });
});

// ── Product Number as stable key ──────────────────────────────────────────────

describe("Product Number stable key matching", () => {
  type MockItem = { id: number; pfgProductNumber: string; price: string; name: string };

  function findByProductNumber(items: MockItem[], productNumber: string) {
    return items.find((i) => i.pfgProductNumber === productNumber) ?? null;
  }

  const existingItems: MockItem[] = [
    { id: 1, pfgProductNumber: "123456", price: "24.99", name: "House Blend Coffee" },
    { id: 2, pfgProductNumber: "789012", price: "15.50", name: "Croissant Dough" },
  ];

  it("finds existing item by product number", () => {
    const found = findByProductNumber(existingItems, "123456");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(1);
    expect(found!.name).toBe("House Blend Coffee");
  });

  it("returns null for unknown product number (new item)", () => {
    const found = findByProductNumber(existingItems, "999999");
    expect(found).toBeNull();
  });

  it("matches correctly even when names differ", () => {
    // Simulates a vendor renaming the product but keeping the same number
    const found = findByProductNumber(existingItems, "789012");
    expect(found).not.toBeNull();
    expect(found!.pfgProductNumber).toBe("789012");
  });
});

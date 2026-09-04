import { describe, expect, it } from "vitest";
import { isPfgOrderGuideCsv, parsePfgCsv, type PfgOrderGuideRow } from "../shared/pfgOrderGuide";
import { buildPfgImportPreview, type PfgExistingItem } from "./pfgReconciliation";

const sep3StyleCsv = `Performance Foodservice
BEIGNETS N BREW - Order Guide 4735
BEIGNETS & BREW PTC (Performance Foodservice Powell - 56293820)
316 CITY CIRCLE
PEACHTREE CITY GA 30269
Area Manager: BOLD BRANDS
Product Description,Brand,StateOfOrigin,Domestic,Product Number,Pack Size,UOM,Price
JUICE ORANGE 100% PLASTIC BOTTLE,SIMPLY ORANGE,,No,413509,12/11.5 OZ,CS,$25.67
MILK ALMOND UNSWEETENED BARISTA BLEND,CALIFIA FARMS,,No,605163,6/32 OZ,CS,$20.00
Generated: 09/03/2026 by Sal Pirani
Disclaimer: "Prices subject to change"`;

function row(overrides: Partial<PfgOrderGuideRow> = {}): PfgOrderGuideRow {
  return {
    itemNumber: "413509",
    name: "Juice Orange 100% Plastic Bottle",
    brand: "SIMPLY ORANGE",
    category: "Other",
    vendor: "PFG",
    packSize: "12/11.5 OZ",
    unitOfMeasure: "CS",
    price: "25.67",
    isAlcohol: false,
    storageArea: "Dry Storage",
    pfgCategory: "",
    ...overrides,
  };
}

const existingItems: PfgExistingItem[] = [
  {
    id: 7,
    itemNumber: "413509",
    name: "Simply Orange Juice",
    brand: "SIMPLY ORANGE",
    packSize: "12/11.5 OZ",
    price: "24.95",
    parLevel: "3.00",
    vendor: "PFG",
    isActive: true,
  },
  {
    id: 2,
    itemNumber: "330275",
    name: "Milk Oat Barista Blend",
    brand: "CALIFIA FARMS",
    packSize: "12/32 OZ",
    price: "36.25",
    parLevel: "2.00",
    vendor: "PFG",
    isActive: true,
  },
  {
    id: 3,
    itemNumber: "593174",
    name: "Milk Almond Barista Unsweetened Original",
    brand: "ALMOND BREEZE",
    packSize: "12/32 OZ",
    price: "35.72",
    parLevel: "2.00",
    vendor: "PFG",
    isActive: true,
  },
  {
    id: 4,
    itemNumber: "960982",
    name: "Banana More Green",
    brand: "CHIQUITA",
    packSize: "1/40 LB",
    price: "32.25",
    parLevel: "1.00",
    vendor: "PFG",
    isActive: true,
  },
];

describe("PFG order-guide detection and parsing", () => {
  it("detects a PFG CSV even when the header follows document metadata", () => {
    expect(isPfgOrderGuideCsv(sep3StyleCsv)).toBe(true);
  });

  it("parses only valid numeric product rows and rejects footer metadata", () => {
    const parsed = parsePfgCsv(sep3StyleCsv);
    expect(parsed.headerRowIndex).toBe(6);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rejectedRows).toBe(2);
    expect(parsed.rows.map((item) => item.itemNumber)).toEqual(["413509", "605163"]);
    expect(parsed.rows.every((item) => item.vendor === "PFG")).toBe(true);
  });

  it("preserves item numbers and normalizes uploaded names without inventing data", () => {
    const parsed = parsePfgCsv(sep3StyleCsv);
    expect(parsed.rows[0]).toMatchObject({
      itemNumber: "413509",
      name: "Juice Orange 100% Plastic Bottle",
      brand: "SIMPLY ORANGE",
      packSize: "12/11.5 OZ",
      price: "25.67",
    });
  });
});

describe("PFG import preview", () => {
  it("classifies matching product numbers as exact and keeps the existing name by default", () => {
    const [preview] = buildPfgImportPreview([row()], existingItems);
    expect(preview.classification).toBe("exact");
    expect(preview.existingItem?.id).toBe(7);
    expect(preview.defaultDecision).toEqual({
      itemNumber: "413509",
      action: "exact",
      existingItemId: 7,
      namePolicy: "keep_existing",
    });
  });

  it("never auto-merges a changed product number with a soft candidate", () => {
    const [preview] = buildPfgImportPreview([
      row({
        itemNumber: "605163",
        name: "Milk Almond Unsweetened Barista Blend",
        brand: "CALIFIA FARMS",
        packSize: "6/32 OZ",
        price: "20.00",
      }),
    ], existingItems);

    expect(preview.classification).toBe("review");
    expect(preview.candidates[0]?.existingItemId).toBe(3);
    expect(preview.candidates.map((candidate) => candidate.existingItemId)).not.toContain(2);
    expect(preview.defaultDecision.action).toBe("skip");
    expect(preview.defaultDecision.existingItemId).toBeUndefined();
  });

  it("surfaces a manufacturer-changed banana as a review candidate", () => {
    const [preview] = buildPfgImportPreview([
      row({
        itemNumber: "821771",
        name: "Banana",
        brand: "DEL MONTE",
        packSize: "1/40 LB",
        price: "25.54",
      }),
    ], existingItems);

    expect(preview.classification).toBe("review");
    expect(preview.candidates[0]?.existingItemId).toBe(4);
    expect(preview.defaultDecision.action).toBe("skip");
  });

  it("labels a product with no soft candidate as new", () => {
    const [preview] = buildPfgImportPreview([
      row({
        itemNumber: "900001",
        name: "Lychee Puree",
        brand: "NEW BRAND",
        packSize: "6/1 LT",
        price: "30.00",
      }),
    ], existingItems);

    expect(preview.classification).toBe("new");
    expect(preview.candidates).toHaveLength(0);
    expect(preview.defaultDecision.action).toBe("create");
  });
});

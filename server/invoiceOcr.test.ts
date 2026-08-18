import { describe, expect, it } from "vitest";
import {
  estimateDeskewDegrees,
  cleanPfgDescription,
  findSingleDigitItemNumberCandidates,
  hasRequiredPfgControls,
  mergeInvoiceSummaries,
  normalizeInvoiceSummaryPayload,
  parseNumericOcr,
  reconstructPfgRowsFromHtml,
  validateAndNormalizePfgInvoice,
  type InvoiceLineDraft,
  type InvoiceSummary,
} from "./invoiceOcr";

const invoice6076192Summary: InvoiceSummary = {
  subtotal: 5551.27,
  tax: 15.43,
  total: 5566.70,
  shippedCount: 101,
  sectionTotals: {},
};

function line(itemNumber: string, shippedQty: number, unitPrice: number, extension = unitPrice * shippedQty): InvoiceLineDraft {
  return {
    itemNumber,
    description: `PFG ITEM ${itemNumber}`,
    pack: "1",
    size: "CS",
    orderedQty: shippedQty,
    shippedQty,
    unitPrice,
    extension,
    category: "BEIGNETS & FOOD-DAIRY",
  };
}

function invoice6076192Lines(): InvoiceLineDraft[] {
  const lines: InvoiceLineDraft[] = [
    // Known single-digit OCR errors from the reported invoice. Validation must
    // recover the extension from price × shipped before checking subtotal.
    line("320834", 2, 34.24, 58.48),
    line("547289", 3, 60.56, 181.48),
    line("441172", 1, 21.51, 21.34),
    line("52522", 2, 81.74),
    line("981346", 2, 68.85),
  ];
  // 21 × 3 shipped and 15 × 2 shipped complete the reported 101 shipped.
  for (let index = 0; index < 20; index += 1) lines.push(line(String(110000 + index), 3, 50));
  for (let index = 0; index < 14; index += 1) lines.push(line(String(120000 + index), 2, 70));
  lines.push(line("130000", 3, 6.14));
  return lines;
}

describe("PFG invoice 6076192 regression", () => {
  it("corrects validated digit-level arithmetic OCR errors and accepts the expected 40-line control totals", () => {
    const result = validateAndNormalizePfgInvoice(invoice6076192Lines(), invoice6076192Summary, 40);

    expect(result.errors).toEqual([]);
    expect(result.lines).toHaveLength(40);
    expect(result.lines.some((item) => item.itemNumber === "52522")).toBe(true);
    expect(result.lines.reduce((sum, item) => sum + (item.shippedQty ?? 0), 0)).toBe(101);
    expect(result.lines.reduce((sum, item) => sum + (item.extension ?? 0), 0)).toBeCloseTo(5551.27, 2);
    expect(result.lines.find((item) => item.itemNumber === "320834")?.extension).toBe(68.48);
    expect(result.lines.find((item) => item.itemNumber === "547289")?.extension).toBe(181.68);
    expect(result.lines.find((item) => item.itemNumber === "441172")?.extension).toBe(21.51);
    expect(result.lines.find((item) => item.itemNumber === "981346")?.extension).toBe(137.7);
  });

  it("uses both document controls to recover item 981346 when one shipped unit is lost", () => {
    const lines = invoice6076192Lines();
    const droppedQuantity = lines.find((item) => item.itemNumber === "981346");
    if (!droppedQuantity) throw new Error("Fixture missing item 981346");
    droppedQuantity.shippedQty = 1;
    droppedQuantity.extension = 68.85;
    const result = validateAndNormalizePfgInvoice(lines, invoice6076192Summary, 40);

    expect(result.errors).toEqual([]);
    expect(result.lines.find((item) => item.itemNumber === "981346")?.shippedQty).toBe(2);
    expect(result.lines.find((item) => item.itemNumber === "981346")?.extension).toBe(137.7);
    expect(result.corrections.join(" ")).toContain("shipped quantity 1 corrected to 2");
  });

  it("rejects the legacy drift pattern instead of returning 38 shifted rows", () => {
    const drifted = invoice6076192Lines().slice(0, 38);
    drifted[4] = { ...drifted[4], description: null, unitPrice: null, extension: null };
    const result = validateAndNormalizePfgInvoice(drifted, invoice6076192Summary, 40);

    expect(result.errors.join(" ")).toContain("Row count mismatch");
    expect(result.errors.join(" ")).toContain("no same-row description");
    expect(result.errors.join(" ")).toContain("no verifiable extension");
  });

  it("uses one physical HTML table row per item and carries category headers without consuming them", () => {
    const html = `
      <table>
        <tr><th>Item Number</th><th>Ordered</th><th>Shipped</th><th>Pack</th><th>Size</th><th>Description</th><th>Unit Price</th><th>Extension</th></tr>
        <tr><td colspan="8">BEIGNETS &amp; FOOD-DAIRY</td></tr>
        <tr><td>158889</td><td>3</td><td>3</td><td>1</td><td>5 LB</td><td>WEST CRK CHEESE AMER YLW SLCD</td><td>16.4100</td><td>49.23</td></tr>
        <tr><td>199408</td><td>1</td><td>1</td><td>12</td><td>32 OZ</td><td>NTRSBST CREAM HVY WHIPPING</td><td>32.0800</td><td>32.08</td></tr>
      </table>`;
    const result = reconstructPfgRowsFromHtml(html);

    expect(result.itemRowCount).toBe(2);
    expect(result.lines.map((item) => item.itemNumber)).toEqual(["158889", "199408"]);
    expect(result.lines.map((item) => item.description)).toEqual([
      "WEST OAK CHEESE AMER YLW SLCD",
      "NTRSBST CREAM HVY WHIPPING",
    ]);
    expect(result.lines.every((item) => item.category === "BEIGNETS & FOOD-DAIRY")).toBe(true);
  });

  it("rejects a PFG section whose item extensions do not reconcile to the recap", () => {
    const lines = [line("158889", 1, 32.08)];
    lines[0].category = "BEIGNETS & FOOD-DAIRY";
    const result = validateAndNormalizePfgInvoice(lines, {
      subtotal: 32.08,
      tax: null,
      total: null,
      shippedCount: 1,
      sectionTotals: { "BEIGNETS & FOOD-DAIRY": 31.08 },
    }, 1);

    expect(result.errors.join(" ")).toContain("does not match recap");
  });

  it("detects a shallow table-rule skew for corrective deskewing", () => {
    const width = 400;
    const height = 300;
    const pixels = new Uint8Array(width * height).fill(255);
    const slope = Math.tan(3 * Math.PI / 180);
    for (let baseY = 30; baseY < height; baseY += 32) {
      for (let x = 0; x < width; x += 1) {
        const y = Math.round(baseY + slope * (x - width / 2));
        if (y >= 0 && y < height) pixels[y * width + x] = 0;
      }
    }
    expect(Math.abs(estimateDeskewDegrees(pixels, width, height))).toBeCloseTo(3, 0);
  });

  it("normalizes constrained numeric OCR strings before calculating a missing extension", () => {
    const parsedUnitPrice = parseNumericOcr("$32.08");
    const parsedShipped = parseNumericOcr("1");
    const result = validateAndNormalizePfgInvoice([{
      itemNumber: "519229",
      description: "PFG ITEM 519229",
      pack: "1",
      size: "CS",
      orderedQty: parsedShipped,
      shippedQty: parsedShipped,
      unitPrice: parsedUnitPrice,
      extension: null,
      category: null,
    }], { subtotal: 32.08, tax: 0, total: 32.08, shippedCount: 1, sectionTotals: {} }, 1);

    expect(result.errors).toEqual([]);
    expect(result.lines[0].extension).toBe(32.08);
  });

  it("excludes footer text from descriptions and provides cosmetic PFG display corrections", () => {
    expect(cleanPfgDescription("SSDC CLEANER EXCELLENT LAVENDE EMERGENCY PHONE: 800-424-9300")).toBe("EBDC CLEANER EXCELLENT LAVENDE");
  });

  it("flags one-digit catalog-key substitutions rather than silently accepting them", () => {
    expect(findSingleDigitItemNumberCandidates("597152", ["997152", "243641"])).toEqual(["997152"]);
    expect(findSingleDigitItemNumberCandidates("247641", ["997152", "243641"])).toEqual(["243641"]);
  });

  it("uses structured page controls when OCR markdown omits the totals block", () => {
    const result = mergeInvoiceSummaries(
      { subtotal: null, tax: null, total: null, shippedCount: null, sectionTotals: {} },
      invoice6076192Summary,
    );

    expect(result).toEqual(invoice6076192Summary);
  });

  it("normalizes image-control fallback values and requires every PFG document control", () => {
    const result = normalizeInvoiceSummaryPayload({
      subtotal: "$5,551.27",
      tax: "15.43",
      total: "5,566.70",
      shippedCount: "101",
      sectionTotals: { "BEIGNETS & FOOD-PAPER": "$137.70" },
    });

    expect(result).toEqual({
      subtotal: 5551.27,
      tax: 15.43,
      total: 5566.7,
      shippedCount: 101,
      sectionTotals: { "BEIGNETS & FOOD-PAPER": 137.7 },
    });
    expect(hasRequiredPfgControls(result)).toBe(true);
    expect(hasRequiredPfgControls({ ...result, tax: null })).toBe(false);
  });
});

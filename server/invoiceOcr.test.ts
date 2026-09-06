import { describe, expect, it } from "vitest";
import {
  shouldSaveValidationDraft,
  combineOcrPageContent,
  estimateDeskewDegrees,
  extractDfaRowsFromOcr,
  cleanPfgDescription,
  extractPfgInvoiceHeader,
  extractPfgPageIndicator,
  corroboratePfgPageCount,
  findSingleDigitItemNumberCandidates,
  hasConsistentPfgDocumentControls,
  hasRequiredPfgControls,
  mergeInvoiceSummaries,
  normalizeInvoiceSummaryPayload,
  normalizeInvoiceDate,
  parseInvoiceDate,
  parseNumericOcr,
  reconstructPfgRowsFromHtml,
  selectPfgItemTable,
  validateAndNormalizePfgInvoice,
  validateAndNormalizeVendorInvoice,
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

const invoice6084988Summary: InvoiceSummary = {
  subtotal: 4934.03,
  tax: 21.04,
  total: 4955.07,
  shippedCount: 91,
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

describe("generic vendor invoice validation", () => {
  it("recovers DFA merchandise rows when Mistral markdown only links a detached HTML table", () => {
    const markdown = `DATE:08/28/26 11:10:41\n[tbl-0.html](tbl-0.html)\nSub-Total: 147.97\nTotal: 147.97`;
    const table = `<table>
      <tr><th>DFA/CUST ITEM</th><th>DESCRIPTION</th><th>PACK</th><th>QTY</th><th>UNIT PRICE</th><th>EXTENSION</th></tr>
      <tr><td>28586</td><td>GL HOMO</td><td>GL</td><td>32</td><td>4.624</td><td>147.97</td></tr>
    </table>`;
    const content = combineOcrPageContent(markdown, [table]);
    const lines = extractDfaRowsFromOcr(content);

    expect(content).toContain("Sub-Total: 147.97");
    expect(content).toContain("<td>28586</td>");
    expect(lines).toEqual([
      {
        itemNumber: "28586",
        description: "GL HOMO",
        pack: "GL",
        size: null,
        orderedQty: 32,
        shippedQty: 32,
        unitPrice: 4.624,
        extension: 147.97,
        category: null,
      },
    ]);

    const result = validateAndNormalizeVendorInvoice(lines, {
      subtotal: 147.97,
      tax: 0,
      total: 147.97,
      shippedCount: null,
      sectionTotals: {},
    }, "DFA");
    expect(result.errors).toEqual([]);
  });

  it("preserves United printed line totals when PRICE is not the delivered case cost", () => {
    const result = validateAndNormalizeVendorInvoice([
      {
        itemNumber: "66555",
        description: "J ROGET BRUT NV 12/750",
        pack: "12/750",
        size: null,
        orderedQty: 1,
        shippedQty: 1,
        unitPrice: 10.45,
        extension: 60,
        category: null,
      },
      {
        itemNumber: "91388",
        description: "SENORITA THC 10MG MANGO 6/4/12Z",
        pack: "6/4/12Z",
        size: null,
        orderedQty: 1,
        shippedQty: 1,
        unitPrice: 78.75,
        extension: 78.75,
        category: null,
      },
      {
        itemNumber: "91386",
        description: "SENORITA THC 5MG LIME JALAPENO 6/4/12Z",
        pack: "6/4/12Z",
        size: null,
        orderedQty: 1,
        shippedQty: 1,
        unitPrice: 71.5,
        extension: 71.5,
        category: null,
      },
      {
        itemNumber: "91387",
        description: "SENORITA THC 5MG MANGO 6/4/12Z",
        pack: "6/4/12Z",
        size: null,
        orderedQty: 1,
        shippedQty: 1,
        unitPrice: 71.5,
        extension: 71.5,
        category: null,
      },
    ], {
      subtotal: 281.75,
      tax: null,
      total: 281.75,
      shippedCount: 4,
      sectionTotals: {},
    }, "United");

    expect(result.errors).toEqual([]);
    expect(result.lines.map((line) => line.extension)).toEqual([60, 78.75, 71.5, 71.5]);
    expect(result.lines.reduce((sum, line) => sum + (line.extension ?? 0), 0)).toBeCloseTo(281.75, 2);
    expect(result.lines.find((line) => line.itemNumber === "66555")?.unitPrice).toBe(60);
    expect(result.corrections.join(" ")).toContain("printed PRICE was 10.45");
  });

  it("accepts DFA-style merchandise rows and rejects a subtotal mismatch", () => {
    const result = validateAndNormalizeVendorInvoice([
      {
        itemNumber: "28586",
        description: "GL HOMO",
        pack: "GL",
        size: null,
        orderedQty: 32,
        shippedQty: 32,
        unitPrice: 4.624,
        extension: 147.97,
        category: null,
      },
    ], {
      subtotal: 147.97,
      tax: 0,
      total: 147.97,
      shippedCount: null,
      sectionTotals: {},
    }, "DFA");
    expect(result.errors).toEqual([]);
    expect(result.lines[0].extension).toBe(147.97);
  });
});

describe("PFG invoice 6076192 regression", () => {
  it("saves a parse with validation errors as a review draft, but not an empty parse", () => {
    expect(shouldSaveValidationDraft(1, ["subtotal mismatch"])).toBe(true);
    expect(shouldSaveValidationDraft(0, ["subtotal mismatch"])).toBe(false);
    expect(shouldSaveValidationDraft(3, [])).toBe(false);
  });

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

  it("recovers zero-extension rows without hiding an independent document ship-count discrepancy", () => {
    const lines: InvoiceLineDraft[] = [
      line("615388", 87, 10, 870),
      { ...line("1034474", 0, 19.54, 58.61), shippedQty: null },
      { ...line("1035686", 0, 48.67, 0), shippedQty: null },
      { ...line("1035689", 0, 48.67, 48.67), shippedQty: null },
      { ...line("1037514", 0, 48.67, 48.67), shippedQty: null },
    ];
    const result = validateAndNormalizePfgInvoice(lines, {
      subtotal: 1025.95,
      tax: 0,
      total: 1025.95,
      shippedCount: 91,
      sectionTotals: {},
    }, 5);

    expect(result.lines.find((item) => item.itemNumber === "1034474")?.shippedQty).toBe(3);
    expect(result.lines.find((item) => item.itemNumber === "1035686")?.shippedQty).toBe(0);
    expect(result.lines.reduce((sum, item) => sum + (item.shippedQty ?? 0), 0)).toBe(92);
    expect(result.corrections.join(" ")).toContain("1034474: shipped quantity 3 recovered");
    expect(result.corrections.join(" ")).toContain("1035686: zero shipped quantity confirmed from its printed zero extension");
    expect(result.errors.join(" ")).toContain("Shipped quantity sum 92 does not match printed ship count 91");
    expect(result.errors.join(" ")).not.toContain("1035686 has no shipped quantity");
  });

  it("corrects the uniquely provable two-unit overstatement from invoice 6084988", () => {
    const lines = [
      line("615388", 90, 54.3595555556, 4892.36),
      // The price OCR field is deliberately wrong. The correction must use
      // the printed extension ÷ extracted quantity, not trust this value.
      line("1031689", 3, 13.89, 125.01),
    ];
    const result = validateAndNormalizePfgInvoice(lines, invoice6084988Summary, 2);

    expect(result.errors).toEqual([]);
    expect(result.lines.find((item) => item.itemNumber === "1031689")?.shippedQty).toBe(1);
    expect(result.lines.find((item) => item.itemNumber === "1031689")?.unitPrice).toBe(41.67);
    expect(result.lines.find((item) => item.itemNumber === "1031689")?.extension).toBe(41.67);
    expect(result.lines.reduce((sum, item) => sum + (item.shippedQty ?? 0), 0)).toBe(91);
    expect(result.lines.reduce((sum, item) => sum + (item.extension ?? 0), 0)).toBeCloseTo(4934.03, 2);
    expect(findSingleDigitItemNumberCandidates("1031689", ["1035689"])).toEqual(["1035689"]);
  });

  it("recognizes PFG grids labeled CAT #", () => {
    const html = `<table>
      <tr><th>CAT #</th><th>Ordered</th><th>Shipped</th><th>Pack</th><th>Size</th><th>Description</th><th>Unit Price</th><th>Extension</th></tr>
      <tr><td>821771</td><td>1</td><td>1</td><td>1</td><td>40 LB</td><td>DELMONTE BANANA</td><td>25.54</td><td>25.54</td></tr>
    </table>`;
    const result = reconstructPfgRowsFromHtml(html);
    expect(result.itemRowCount).toBe(1);
    expect(result.lines[0]?.itemNumber).toBe("821771");
    expect(result.lines[0]?.extension).toBe(25.54);
  });

  it("normalizes cent-level line extension drift before subtotal validation", () => {
    const lines = [
      line("534152", 5, 40.75, 203.74),
      line("265274", 1, 22.03, 22.01),
    ];
    const result = validateAndNormalizePfgInvoice(lines, {
      subtotal: 225.78,
      tax: 0,
      total: 225.78,
      shippedCount: 6,
      sectionTotals: {},
    }, 2);
    expect(result.errors).toEqual([]);
    expect(result.lines.map((item) => item.extension)).toEqual([203.75, 22.03]);
    expect(result.lines.reduce((sum, item) => sum + (item.extension ?? 0), 0)).toBeCloseTo(225.78, 2);
    expect(result.corrections.join(" ")).toContain("534152: extension 203.74 corrected to 203.75");
    expect(result.corrections.join(" ")).toContain("265274: extension 22.01 corrected to 22.03");
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

  it("stops before PFG recap and footer grids so their numeric cells never become product items", () => {
    const html = `
      <table>
        <tr><th>Item Number</th><th>Ordered</th><th>Shipped</th><th>Pack</th><th>Size</th><th>Description</th><th>Unit Price</th><th>Extension</th></tr>
        <tr><td>332560</td><td>3</td><td>3</td><td>1</td><td>3 GA</td><td>TILLAMK ICE CREAM VAN BEAN TUB</td><td>39.4300</td><td>118.29</td></tr>
        <tr><td>534152</td><td>5</td><td>5</td><td>4</td><td>50 CT</td><td>ROYAL BOX TAKE OUT FOLDED #3 KRAFT</td><td>40.7500</td><td>203.75</td></tr>
        <tr><td>981346</td><td>1</td><td>1</td><td>1</td><td>250 CT</td><td>BEI BREW BAG WHITE</td><td>68.8500</td><td>68.85</td></tr>
        <tr><td>CAT #</td><td>DESCRIPTION</td><td>COST</td><td>TAX</td><td>TOTAL</td></tr>
        <tr><td>99979</td><td>OTHER</td><td>25.54</td><td>0.00</td><td>25.54</td></tr>
        <tr><td>14333056</td><td>TOTAL</td><td>3515.11</td><td>6.02</td><td>3521.13</td></tr>
      </table>`;
    const result = reconstructPfgRowsFromHtml(html);

    expect(result.itemRowCount).toBe(3);
    expect(result.usableRowCount).toBe(3);
    expect(result.lines.map((line) => line.itemNumber)).toEqual(["332560", "534152", "981346"]);
  });

  it("selects the viable PFG product grid instead of a larger recap/footer table", () => {
    const productGrid = `
      <table><tr><th>Item Number</th><th>Ordered</th><th>Shipped</th><th>Pack</th><th>Size</th><th>Description</th><th>Price</th><th>Extension</th></tr>
      <tr><td>332560</td><td>3</td><td>3</td><td>1</td><td>3 GA</td><td>TILLAMK ICE CREAM</td><td>39.43</td><td>118.29</td></tr>
      <tr><td>534152</td><td>5</td><td>5</td><td>4</td><td>50 CT</td><td>ROYAL BOX</td><td>40.75</td><td>203.75</td></tr></table>`;
    const recapGrid = `
      <table><tr><th>Item Number</th><th>Ordered</th><th>Shipped</th><th>Pack</th><th>Size</th><th>Description</th><th>Price</th><th>Extension</th></tr>
      <tr><td>99979</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>14333056</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>`;
    const selected = selectPfgItemTable([recapGrid, productGrid]);

    expect(selected?.lines.map((line) => line.itemNumber)).toEqual(["332560", "534152"]);
    expect(selected?.usableRowCount).toBe(2);
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

  it("recovers a PFG invoice number and canonical invoice date directly from OCR markdown", () => {
    const header = extractPfgInvoiceHeader(`
      PERFORMANCE FOODSERVICE
      INVOICE NO. 6084988
      INVOICE DATE: 08/17/26
      CUSTOMER: BEIGNETS & BREW
    `);
    expect(header).toEqual({ invoiceNumber: "6084988", invoiceDate: "2026-08-17" });
  });

  it("detects printed PFG page counts so incomplete uploads can remain protected review drafts", () => {
    expect(extractPfgPageIndicator("ROUTE 1C5 STOP 3 PAGE 1 / 3 DATE 8/31/26")).toEqual({ page: 1, totalPages: 3 });
    expect(extractPfgPageIndicator("PAGE 2 OF 3")).toEqual({ page: 2, totalPages: 3 });
    expect(extractPfgPageIndicator("PAGE 0 / 3")).toBeNull();
  });

  it("requires corroborated page ordinals before enforcing a missing-page hold", () => {
    expect(corroboratePfgPageCount([{ page: 1, totalPages: 3 }, { page: 2, totalPages: 3 }], 2)).toBe(3);
    expect(corroboratePfgPageCount([{ page: 1, totalPages: 3 }, null], 2)).toBeNull();
    expect(corroboratePfgPageCount([{ page: 1, totalPages: 3 }, { page: 3, totalPages: 3 }], 2)).toBeNull();
    expect(corroboratePfgPageCount([{ page: 1, totalPages: 3 }], 1)).toBe(3);
  });

  it("does not infer a multi-page document from ordinary PAGE 1 and PAGE 2 labels", () => {
    expect(extractPfgPageIndicator("ROUTE 1C5 STOP 3 PAGE 1 DATE 8/31/26")).toBeNull();
    expect(extractPfgPageIndicator("ROUTE 1C5 STOP 3 PAGE 2 DATE 8/31/26")).toBeNull();
  });

  it("accepts ISO dates from manual review and rejects impossible invoice dates", () => {
    expect(normalizeInvoiceDate("2026-08-17")).toBe("2026-08-17");
    expect(parseInvoiceDate("08/17/26")?.toISOString()).toBe("2026-08-17T12:00:00.000Z");
    expect(normalizeInvoiceDate("02/30/26")).toBeNull();
    expect(extractPfgInvoiceHeader("INVOICE 6084988\nINVOICE DATE: 02/30/26")).toEqual({
      invoiceNumber: "6084988",
      invoiceDate: null,
    });
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

  it("prefers complete document controls over a page-level category recap", () => {
    const categoryPageControls = {
      subtotal: 491.63,
      tax: 0,
      total: 491.63,
      shippedCount: 15,
      sectionTotals: {},
    };

    expect(mergeInvoiceSummaries(invoice6076192Summary, categoryPageControls)).toEqual(invoice6076192Summary);
  });

  it("rejects internally inconsistent category recap controls before document selection", () => {
    expect(hasConsistentPfgDocumentControls(invoice6076192Summary)).toBe(true);
    expect(hasConsistentPfgDocumentControls({
      subtotal: 491.63,
      tax: 15.43,
      total: 5566.7,
      shippedCount: 15,
      sectionTotals: {},
    })).toBe(false);
  });
});

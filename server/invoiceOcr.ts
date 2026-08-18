import sharp from "sharp";

export interface InvoiceLineDraft {
  itemNumber: string | null;
  description: string | null;
  pack: string | null;
  size: string | null;
  orderedQty: number | null;
  shippedQty: number | null;
  unitPrice: number | null;
  extension: number | null;
  category: string | null;
}

export interface InvoiceSummary {
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  shippedCount: number | null;
  sectionTotals: Record<string, number>;
}

/** Uses the first verified value for each document control, preserving section recaps. */
export function mergeInvoiceSummaries(primary: InvoiceSummary, fallback: InvoiceSummary): InvoiceSummary {
  return {
    subtotal: primary.subtotal ?? fallback.subtotal,
    tax: primary.tax ?? fallback.tax,
    total: primary.total ?? fallback.total,
    shippedCount: primary.shippedCount ?? fallback.shippedCount,
    sectionTotals: { ...fallback.sectionTotals, ...primary.sectionTotals },
  };
}

export interface PfgTableParseResult {
  lines: InvoiceLineDraft[];
  itemRowCount: number;
}

export interface ValidationResult {
  lines: InvoiceLineDraft[];
  errors: string[];
  corrections: string[];
}

export interface DeskewResult {
  jpeg: Buffer;
  correctionDegrees: number;
  rejected: boolean;
  reason: string | null;
}

const MONEY_TOLERANCE = 0.02;
const ITEM_NUMBER = /^\d{5,8}$/;
const MAX_AUTO_DESKEW_DEGREES = 5;
const PFG_SECTIONS = [
  "BEIGNETS & FOOD-DAIRY",
  "COFFEE-DAIRY",
  "BEIGNETS & FOOD-STEAK/PO",
  "BEIGNETS & FOOD-PAPER",
  "CHEMICALS-PAPER",
  "CHEMICALS",
  "COFFEE-PAPER",
  "NA BEVERAGES",
  "COFFEE-PRODUCE",
];
const PFG_FOOTER_MARKERS = /\b(?:EMERGENCY\s+PHONE|CUSTOMER\s+SERVICE|THANK\s+YOU\s+FOR\s+YOUR\s+BUSINESS)\b/i;
const PFG_DESCRIPTION_CORRECTIONS: Array<[RegExp, string]> = [
  [/\bWEST\s+CRK\b/gi, "WEST OAK"],
  [/\bLTD23SCT:ESPRESSO\b/gi, "KIRKIN'S EXPRESS"],
  [/\bCHIQUITA\b/gi, "CRIQUITA"],
  [/\bWESSON\b/gi, "WESSOM"],
  [/\bHRML\b/gi, "REML"],
  [/\bSSDC\b/gi, "EBDC"],
];

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function columnIndex(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
}

export function parseNumericOcr(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  const numeric = String(value).replace(/[^0-9.-]/g, "");
  if (!numeric || numeric === "-" || numeric === ".") return null;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Normalizes compact LLM or vision control-total JSON into the invoice summary contract. */
export function normalizeInvoiceSummaryPayload(payload: unknown): InvoiceSummary {
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const rawSections = source.sectionTotals && typeof source.sectionTotals === "object"
    ? source.sectionTotals as Record<string, unknown>
    : {};
  const sectionTotals = Object.entries(rawSections).reduce<Record<string, number>>((result, [section, value]) => {
    const parsed = parseNumericOcr(value);
    if (parsed !== null) result[section] = parsed;
    return result;
  }, {});
  return {
    subtotal: parseNumericOcr(source.subtotal),
    tax: parseNumericOcr(source.tax),
    total: parseNumericOcr(source.total) ?? parseNumericOcr(source.totalAmount),
    shippedCount: parseNumericOcr(source.shippedCount),
    sectionTotals,
  };
}

export function hasRequiredPfgControls(summary: InvoiceSummary): boolean {
  return summary.subtotal !== null
    && summary.tax !== null
    && summary.total !== null
    && summary.shippedCount !== null;
}

/** A page can contain a category recap with numbers in control-like fields. */
export function hasConsistentPfgDocumentControls(summary: InvoiceSummary): boolean {
  if (!hasRequiredPfgControls(summary)) return false;
  return Math.abs(((summary.subtotal as number) + (summary.tax as number)) - (summary.total as number)) <= 0.02;
}

/** Keeps invoice descriptions readable while never changing the matching key. */
export function cleanPfgDescription(value: string | null | undefined): string | null {
  if (!value) return null;
  let cleaned = value.split(PFG_FOOTER_MARKERS)[0].replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of PFG_DESCRIPTION_CORRECTIONS) cleaned = cleaned.replace(pattern, replacement);
  return cleaned || null;
}

/** Returns catalog keys that are a single OCR digit substitution from a parsed key. */
export function findSingleDigitItemNumberCandidates(itemNumber: string, catalogNumbers: string[]): string[] {
  const candidates: string[] = [];
  for (const catalogNumber of catalogNumbers) {
    if (catalogNumber.length !== itemNumber.length) continue;
    let differences = 0;
    for (let index = 0; index < itemNumber.length; index += 1) {
      if (itemNumber[index] !== catalogNumber[index]) differences += 1;
      if (differences > 1) break;
    }
    if (differences === 1) candidates.push(catalogNumber);
  }
  return candidates;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function extractHtmlRows(html: string): string[][] {
  const rows: string[][] = [];
  const rowMatches = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
  for (const rowMatch of rowMatches) {
    const cells: string[] = [];
    const cellMatches = Array.from(rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi));
    for (const cellMatch of cellMatches) cells.push(decodeHtml(cellMatch[1]));
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function isCategoryHeader(cells: string[]): boolean {
  const text = cells.filter(Boolean).join(" ").trim();
  if (!text || /\d{5,8}/.test(text) || /\$?\d+[,.]\d{2}/.test(text)) return false;
  // PFG section headers are uppercase labels with no item number, quantity, or money.
  return text === text.toUpperCase() && /[A-Z]/.test(text) && text.length >= 4;
}

/**
 * Uses OCR's HTML table output, which preserves the physical table grid. Each
 * record is read from one <tr>; values from independent columns are never zipped
 * together, so a broken reading order cannot shift a description down a row.
 */
export function reconstructPfgRowsFromHtml(html: string): PfgTableParseResult {
  const rows = extractHtmlRows(html);
  const headerRowIndex = rows.findIndex((row) => {
    const combined = row.map(headerKey).join(" ");
    return combined.includes("item") && combined.includes("description") && (combined.includes("shipped") || combined.includes("ship"));
  });
  if (headerRowIndex < 0) return { lines: [], itemRowCount: 0 };

  const headerRow = rows[headerRowIndex].map(headerKey);
  const itemIndex = columnIndex(headerRow, ["itemnumber", "itemno", "item"]);
  const orderedIndex = columnIndex(headerRow, ["ordered", "order"]);
  const shippedIndex = columnIndex(headerRow, ["shipped", "ship"]);
  const packIndex = columnIndex(headerRow, ["pack"]);
  const sizeIndex = columnIndex(headerRow, ["size"]);
  const descriptionIndex = columnIndex(headerRow, ["description", "desc"]);
  const priceIndex = columnIndex(headerRow, ["unitprice", "price"]);
  const extensionIndex = columnIndex(headerRow, ["extension", "ext"]);
  if (itemIndex < 0 || descriptionIndex < 0) return { lines: [], itemRowCount: 0 };

  let activeCategory: string | null = null;
  let itemRowCount = 0;
  const lines: InvoiceLineDraft[] = [];

  for (const cells of rows.slice(headerRowIndex + 1)) {
    const itemNumber = (cells[itemIndex] ?? "").replace(/\D/g, "");
    if (!ITEM_NUMBER.test(itemNumber)) {
      if (isCategoryHeader(cells)) activeCategory = cells.filter(Boolean).join(" ").trim();
      continue;
    }
    itemRowCount += 1;
    lines.push({
      itemNumber,
      description: cleanPfgDescription(cells[descriptionIndex]),
      pack: packIndex >= 0 ? cells[packIndex]?.trim() || null : null,
      size: sizeIndex >= 0 ? cells[sizeIndex]?.trim() || null : null,
      orderedQty: orderedIndex >= 0 ? parseNumericOcr(cells[orderedIndex]) : null,
      shippedQty: shippedIndex >= 0 ? parseNumericOcr(cells[shippedIndex]) : null,
      unitPrice: priceIndex >= 0 ? parseNumericOcr(cells[priceIndex]) : null,
      extension: extensionIndex >= 0 ? parseNumericOcr(cells[extensionIndex]) : null,
      category: activeCategory,
    });
  }
  return { lines, itemRowCount };
}

function findMoney(markdown: string, pattern: RegExp): number | null {
  const match = markdown.match(pattern);
  return match ? parseNumericOcr(match[1]) : null;
}

/** Extracts control totals that later act as a hard acceptance gate. */
export function extractInvoiceSummary(markdown: string): InvoiceSummary {
  const subtotal = findMoney(markdown, /(?:SUB\s*TOTAL|SUBTOTAL)[^\d$]*\$?\s*([\d,]+\.\d{2})/i);
  const tax = findMoney(markdown, /(?:\bTAX\b)[^\d$]*\$?\s*([\d,]+\.\d{2})/i);
  const total = findMoney(markdown, /(?:^|\n|\|)\s*TOTAL(?!\s*(?:ITEMS|QTY))[^\d$]*\$?\s*([\d,]+\.\d{2})/im);
  const shipMatch = markdown.match(/(?:TOTAL\s+)?SHIPP?ED?(?:\s+(?:COUNT|QTY|QUANTITY))?[^\d]*(\d+)\b/i);
  const shippedCount = shipMatch ? parseNumericOcr(shipMatch[1]) : null;
  const sectionTotals: Record<string, number> = {};
  for (const section of PFG_SECTIONS) {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = markdown.match(new RegExp(`${escaped}[^\n\d$]{0,120}\\$?\\s*([\\d,]+\\.\\d{2})`, "i"));
    const value = match ? parseNumericOcr(match[1]) : null;
    if (value !== null) sectionTotals[section] = value;
  }
  return { subtotal, tax, total, shippedCount, sectionTotals };
}

/**
 * Enforces invoice arithmetic before rows can be persisted. A price × shipped
 * calculation may repair an OCR typo in extension; all other failures reject the
 * entire upload instead of silently applying shifted inventory.
 */
export function validateAndNormalizePfgInvoice(
  inputLines: InvoiceLineDraft[],
  summary: InvoiceSummary,
  sourceItemRowCount: number | null
): ValidationResult {
  const errors: string[] = [];
  const corrections: string[] = [];
  const lines = inputLines.map((line) => ({ ...line }));
  if (sourceItemRowCount === null) errors.push("Could not verify the physical PFG item-row count from table geometry.");
  if (sourceItemRowCount !== null && sourceItemRowCount !== lines.length) {
    errors.push(`Row count mismatch: table has ${sourceItemRowCount} item rows but extraction produced ${lines.length}.`);
  }

  for (const line of lines) {
    if (!line.itemNumber || !ITEM_NUMBER.test(line.itemNumber)) errors.push("A row is missing a valid item number.");
    if (!line.description) errors.push(`Item ${line.itemNumber ?? "unknown"} has no same-row description.`);
    if (line.shippedQty === null) errors.push(`Item ${line.itemNumber ?? "unknown"} has no shipped quantity.`);
    if (line.unitPrice === null) errors.push(`Item ${line.itemNumber ?? "unknown"} has no verifiable unit price.`);

    if (line.unitPrice !== null && line.shippedQty !== null) {
      const calculatedExtension = roundMoney(line.unitPrice * line.shippedQty);
      if (line.extension === null || Math.abs(calculatedExtension - line.extension) > MONEY_TOLERANCE) {
        const prior = line.extension;
        line.extension = calculatedExtension;
        corrections.push(`Item ${line.itemNumber ?? "unknown"}: extension ${prior ?? "missing"} corrected to ${calculatedExtension.toFixed(2)} from unit price × shipped.`);
      }
    }
    if (line.extension === null) errors.push(`Item ${line.itemNumber ?? "unknown"} has no verifiable extension.`);
  }

  const extensionSum = roundMoney(lines.reduce((sum, line) => sum + (line.extension ?? 0), 0));
  const shippedSum = lines.reduce((sum, line) => sum + (line.shippedQty ?? 0), 0);
  const subtotalGap = summary.subtotal === null ? null : roundMoney(summary.subtotal - extensionSum);
  const shippedGap = summary.shippedCount === null ? null : summary.shippedCount - shippedSum;
  // Repair only when both independent document controls identify exactly one
  // price-equals-extension row whose missing quantity explains both gaps.
  if (subtotalGap !== null && shippedGap !== null && shippedGap > 0) {
    const quantityCandidates = lines.filter((line) => {
      if (line.unitPrice === null || line.extension === null || line.shippedQty === null) return false;
      const proposedQty = line.shippedQty + shippedGap;
      const proposedExtension = roundMoney(line.unitPrice * proposedQty);
      return Math.abs(line.unitPrice - line.extension) <= MONEY_TOLERANCE
        && Math.abs(roundMoney(proposedExtension - line.extension) - subtotalGap) <= MONEY_TOLERANCE;
    });
    if (quantityCandidates.length === 1) {
      const candidate = quantityCandidates[0];
      const oldQuantity = candidate.shippedQty as number;
      candidate.shippedQty = oldQuantity + shippedGap;
      candidate.extension = roundMoney((candidate.unitPrice as number) * candidate.shippedQty);
      corrections.push(`Item ${candidate.itemNumber ?? "unknown"}: shipped quantity ${oldQuantity} corrected to ${candidate.shippedQty} from document subtotal and ship-count controls.`);
    } else if (quantityCandidates.length > 1) {
      errors.push(`Document totals indicate ${shippedGap} missing shipped unit(s), but multiple price-equals-extension rows are possible: ${quantityCandidates.map((line) => line.itemNumber).join(", ")}.`);
    }
  }

  const reconciledExtensionSum = roundMoney(lines.reduce((sum, line) => sum + (line.extension ?? 0), 0));
  const reconciledShippedSum = lines.reduce((sum, line) => sum + (line.shippedQty ?? 0), 0);
  if (summary.subtotal === null) errors.push("Could not verify the printed PFG subtotal.");
  if (summary.tax === null) errors.push("Could not verify the printed PFG tax.");
  if (summary.total === null) errors.push("Could not verify the printed PFG total.");
  if (summary.shippedCount === null) errors.push("Could not verify the printed PFG ship count.");
  if (summary.subtotal !== null && Math.abs(reconciledExtensionSum - summary.subtotal) > MONEY_TOLERANCE) {
    const suspected = lines
      .filter((line) => line.shippedQty !== null && line.shippedQty > 1 && line.unitPrice !== null && line.extension !== null && Math.abs(line.unitPrice - line.extension) <= MONEY_TOLERANCE)
      .map((line) => line.itemNumber)
      .filter(Boolean);
    const suspectDetail = suspected.length > 0 ? ` Suspect price-equals-extension row(s): ${suspected.join(", ")}.` : "";
    errors.push(`Extension sum ${reconciledExtensionSum.toFixed(2)} does not match printed subtotal ${summary.subtotal.toFixed(2)}.${suspectDetail}`);
  }
  if (summary.tax !== null && summary.total !== null && summary.subtotal !== null
    && Math.abs(roundMoney(summary.subtotal + summary.tax) - summary.total) > MONEY_TOLERANCE) {
    errors.push("Printed subtotal plus tax does not match printed total.");
  }
  if (summary.shippedCount !== null && Math.abs(reconciledShippedSum - summary.shippedCount) > 0.001) {
    errors.push(`Shipped quantity sum ${reconciledShippedSum} does not match printed ship count ${summary.shippedCount}.`);
  }
  for (const [section, printedTotal] of Object.entries(summary.sectionTotals)) {
    const calculatedTotal = roundMoney(lines
      .filter((line) => line.category === section)
      .reduce((sum, line) => sum + (line.extension ?? 0), 0));
    if (calculatedTotal > 0 && Math.abs(calculatedTotal - printedTotal) > MONEY_TOLERANCE) {
      errors.push(`Section ${section} total ${calculatedTotal.toFixed(2)} does not match recap ${printedTotal.toFixed(2)}.`);
    }
  }

  return { lines, errors: Array.from(new Set(errors)), corrections };
}

/**
 * Estimates the corrective rotation that maximizes horizontal dark-pixel
 * projection. PFG table rules produce a strong score, avoiding unreliable text
 * reading order as a geometry signal.
 */
export function estimateDeskewDegrees(data: Uint8Array, width: number, height: number): number {
  const darkPixels: Array<[number, number]> = [];
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 1500));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      if (data[y * width + x] < 105) darkPixels.push([x, y]);
    }
  }
  if (darkPixels.length < 200) return 0;

  let bestAngle = 0;
  let bestScore = -Infinity;
  const centerX = width / 2;
  const centerY = height / 2;
  for (let angle = -8; angle <= 8; angle += 0.25) {
    const radians = angle * Math.PI / 180;
    const sin = Math.sin(radians);
    const cos = Math.cos(radians);
    const projection = new Uint16Array(height + width);
    for (const [x, y] of darkPixels) {
      const projectedY = Math.round((y - centerY) * cos + (x - centerX) * sin) + Math.floor((height + width) / 2);
      if (projectedY >= 0 && projectedY < projection.length) projection[projectedY] += 1;
    }
    let score = 0;
    for (let index = 0; index < projection.length; index += 1) score += projection[index] * projection[index];
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  return Math.round(bestAngle * 100) / 100;
}

export async function deskewInvoiceForOcr(input: Buffer): Promise<DeskewResult> {
  const normalized = sharp(input, { failOn: "none" }).rotate();
  const preview = await normalized.clone().resize({ width: 1400, withoutEnlargement: true }).grayscale().normalise().raw().toBuffer({ resolveWithObject: true });
  const correctionDegrees = estimateDeskewDegrees(preview.data, preview.info.width, preview.info.height);
  if (Math.abs(correctionDegrees) > MAX_AUTO_DESKEW_DEGREES) {
    return {
      jpeg: Buffer.alloc(0),
      correctionDegrees,
      rejected: true,
      reason: `Photo is rotated by approximately ${Math.abs(correctionDegrees).toFixed(1)}°. Please retake it square to the page before uploading.`,
    };
  }
  const jpeg = await normalized.rotate(correctionDegrees, { background: { r: 255, g: 255, b: 255, alpha: 1 } }).jpeg({ quality: 94, mozjpeg: true }).toBuffer();
  return { jpeg, correctionDegrees, rejected: false, reason: null };
}

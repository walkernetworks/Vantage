export const PFG_CATEGORY_MAP: Record<string, string> = {
  "ALCOHOL-BEVERAGES": "Alcohol - 100",
  "ALCOHOL-DRY FOODS": "Alcohol - 130",
  "BEIGNETS & FOOD-DRY FOODS": "Bakery",
  "BEIGNETS & FOOD-FROZEN": "Bakery",
  "BEIGNETS & FOOD-REFRIG": "Bakery",
  "BEIGNETS & FOOD-DAIRY": "Dairy",
  "BEIGNETS & FOOD-PRODUCE": "Produce",
  "BEIGNETS & FOOD-CHICKEN": "Protein",
  "BEIGNETS & FOOD-STEAK/POR": "Protein",
  "BEIGNETS & FOOD-PAPER": "Paper Goods",
  "COFFEE-BEVERAGES": "Coffee",
  "COFFEE-DRY FOODS": "Coffee",
  "COFFEE-DAIRY": "Dairy",
  "COFFEE-PRODUCE": "Produce",
  "COFFEE-PAPER": "Paper Goods",
  "NA BEVERAGES": "Coffee",
  "NA BEVERAGES-FROZEN": "Coffee",
  "NA BEVERAGES-PRODUCE": "Produce",
  CHEMICALS: "Supplies",
  "CHEMICALS-PAPER": "Supplies",
};

export const PFG_STORAGE_MAP: Record<string, string> = {
  "ALCOHOL-BEVERAGES": "Bar",
  "ALCOHOL-DRY FOODS": "Bar",
  "BEIGNETS & FOOD-FROZEN": "Freezer",
  "BEIGNETS & FOOD-REFRIG": "Walk-In",
  "BEIGNETS & FOOD-DAIRY": "Walk-In",
  "COFFEE-DAIRY": "Walk-In",
  "BEIGNETS & FOOD-PRODUCE": "Walk-In",
  "COFFEE-PRODUCE": "Walk-In",
  "NA BEVERAGES-FROZEN": "Freezer",
  "NA BEVERAGES-PRODUCE": "Walk-In",
};

export type PfgOrderGuideRow = {
  itemNumber: string;
  name: string;
  brand: string;
  category: string;
  vendor: "PFG";
  packSize: string;
  unitOfMeasure: string;
  price: string;
  isAlcohol: boolean;
  alcoholCategory?: string;
  storageArea?: string;
  pfgCategory: string;
};

export type PfgParseResult = {
  rows: PfgOrderGuideRow[];
  headerRowIndex: number;
  rejectedRows: number;
};

const REQUIRED_HEADERS = ["product description", "product number", "pack size", "price"];

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  result.push(current.trim());
  return result;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function findPfgHeaderRow(rows: unknown[][], maxRows = 25): number {
  for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
    const headers = rows[i].map(normalizeHeader);
    if (REQUIRED_HEADERS.every((header) => headers.includes(header))) return i;
  }
  return -1;
}

export function isPfgOrderGuideCsv(text: string): boolean {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const rows = lines.slice(0, 25).map(parseCsvLine);
  return findPfgHeaderRow(rows) !== -1;
}

export function cleanPfgName(rawName: string): string {
  return rawName
    .replace(/\b0 GRAMS TRANS FAT PER SERVING\b/gi, "")
    .replace(/\bNO_HIGH_FRUCTOSE_CORN_SYRUP\b/gi, "")
    .replace(/\bUNITED_STATES_DEPT_AGRICULTURE SHIELD\b/gi, "")
    .replace(/\bULTRA-HIGH-TEMPERATURE STABILIZED\b/gi, "")
    .replace(/\bULTRA PASTEURIZED\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word)
    .join(" ");
}

export function parsePfgRows(rawRows: unknown[][]): PfgParseResult {
  const headerRowIndex = findPfgHeaderRow(rawRows);
  if (headerRowIndex === -1) return { rows: [], headerRowIndex, rejectedRows: 0 };

  const headers = rawRows[headerRowIndex].map(normalizeHeader);
  const column = (...names: string[]) => {
    for (const name of names) {
      const index = headers.indexOf(normalizeHeader(name));
      if (index !== -1) return index;
    }
    return -1;
  };

  const indexes = {
    category: column("category name", "category"),
    customDescription: column("custom product description"),
    productDescription: column("product description"),
    brand: column("brand"),
    productNumber: column("product number"),
    packSize: column("pack size"),
    uom: column("uom", "unit of measure"),
    price: column("price"),
  };

  const rows: PfgOrderGuideRow[] = [];
  let rejectedRows = 0;

  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const cells = rawRows[i] ?? [];
    if (cells.every((cell) => String(cell ?? "").trim() === "")) continue;

    const customDescription = indexes.customDescription === -1 ? "" : String(cells[indexes.customDescription] ?? "").trim();
    const productDescription = String(cells[indexes.productDescription] ?? "").trim();
    const rawName = customDescription || productDescription;
    const itemNumber = String(cells[indexes.productNumber] ?? "").trim();

    // PFG product numbers are numeric. This rejects repeated headers, addresses,
    // generated-at footers, disclaimers, and any other document metadata.
    if (!rawName || !/^\d+$/.test(itemNumber)) {
      rejectedRows++;
      continue;
    }

    const rawPrice = String(cells[indexes.price] ?? "").replace(/[$,]/g, "").trim();
    const parsedPrice = Number.parseFloat(rawPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      rejectedRows++;
      continue;
    }

    const pfgCategory = indexes.category === -1 ? "" : String(cells[indexes.category] ?? "").trim().toUpperCase();
    const category = PFG_CATEGORY_MAP[pfgCategory] ?? "Other";
    const storageArea = PFG_STORAGE_MAP[pfgCategory] ?? "Dry Storage";
    const isAlcohol = category.startsWith("Alcohol");

    rows.push({
      itemNumber,
      name: cleanPfgName(rawName),
      brand: indexes.brand === -1 ? "" : String(cells[indexes.brand] ?? "").trim(),
      category,
      vendor: "PFG",
      packSize: indexes.packSize === -1 ? "" : String(cells[indexes.packSize] ?? "").trim(),
      unitOfMeasure: indexes.uom === -1 ? "CS" : String(cells[indexes.uom] ?? "CS").trim() || "CS",
      price: parsedPrice.toFixed(2),
      isAlcohol,
      alcoholCategory: category === "Alcohol - 100" ? "100" : category === "Alcohol - 130" ? "130" : undefined,
      storageArea,
      pfgCategory,
    });
  }

  return { rows, headerRowIndex, rejectedRows };
}

export function parsePfgCsv(text: string): PfgParseResult {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  return parsePfgRows(lines.map(parseCsvLine));
}

import type { PfgOrderGuideRow } from "../shared/pfgOrderGuide";

export type PfgNamePolicy = "keep_existing" | "use_uploaded";
export type PfgApplyDecision = {
  itemNumber: string;
  action: "exact" | "merge" | "create" | "skip";
  existingItemId?: number;
  namePolicy?: PfgNamePolicy;
};

export type PfgExistingItem = {
  id: number;
  itemNumber: string | null;
  name: string;
  brand: string | null;
  packSize: string | null;
  price: string | null;
  parLevel: string | null;
  vendor: string;
  isActive: boolean;
};

export type PfgCandidate = {
  existingItemId: number;
  itemNumber: string | null;
  name: string;
  brand: string | null;
  packSize: string | null;
  price: string | null;
  parLevel: string | null;
  score: number;
  sameBrand: boolean;
  samePackSize: boolean;
};

export type PfgPreviewRow = {
  row: PfgOrderGuideRow;
  classification: "exact" | "review" | "new";
  existingItem?: PfgExistingItem;
  candidates: PfgCandidate[];
  defaultDecision: PfgApplyDecision;
};

function normalize(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b0 grams trans fat per serving\b/g, " ")
    .replace(/\bno high fructose corn syrup\b/g, " ")
    .replace(/\bunited states dept agriculture shield\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string | null | undefined): Set<string> {
  return new Set(normalize(value).split(/\s+/).filter(Boolean));
}

const PRODUCT_VARIANT_TOKENS = new Set([
  "almond", "oat", "soy", "coconut", "whole", "skim", "chocolate", "white",
  "strawberry", "raspberry", "blueberry", "peach", "mango", "hazelnut", "vanilla",
  "caramel", "salted", "decaf", "decaffeinated", "unsweetened", "sweetened", "orange",
  "lemon", "lime", "banana", "chicken", "beef", "pork", "ham", "turkey", "sausage",
  "bacon",
]);

function variantTokens(value: string | null | undefined): Set<string> {
  return new Set(Array.from(tokens(value)).filter((token) => PRODUCT_VARIANT_TOKENS.has(token)));
}

function tokenOverlap(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  Array.from(a).forEach((token) => {
    if (b.has(token)) intersection++;
  });
  return intersection / new Set(Array.from(a).concat(Array.from(b))).size;
}

function orderedSimilarity(left: string, right: string): number {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const rows = a.length + 1;
  const columns = b.length + 1;
  const previous = new Array<number>(columns);
  const current = new Array<number>(columns);
  for (let j = 0; j < columns; j++) previous[j] = j;
  for (let i = 1; i < rows; i++) {
    current[0] = i;
    for (let j = 1; j < columns; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j < columns; j++) previous[j] = current[j];
  }
  return 1 - previous[columns - 1] / Math.max(a.length, b.length);
}

export function scorePfgReplacement(row: PfgOrderGuideRow, item: PfgExistingItem): PfgCandidate {
  const sameBrand = Boolean(normalize(row.brand)) && normalize(row.brand) === normalize(item.brand);
  const samePackSize = Boolean(normalize(row.packSize)) && normalize(row.packSize) === normalize(item.packSize);
  const ordered = orderedSimilarity(row.name, item.name);
  const overlap = tokenOverlap(row.name, item.name);
  const rowVariants = variantTokens(row.name);
  const itemVariants = variantTokens(item.name);
  const sharedVariants = Array.from(rowVariants).filter((token) => itemVariants.has(token));
  const hasVariantConflict = rowVariants.size > 0 && itemVariants.size > 0 && sharedVariants.length === 0;
  const variantEvidence = sharedVariants.length > 0 ? 15 : hasVariantConflict ? -15 : 0;
  const score = ordered * 55 + overlap * 20 + (sameBrand ? 15 : 0) + (samePackSize ? 10 : 0) + variantEvidence;

  return {
    existingItemId: item.id,
    itemNumber: item.itemNumber,
    name: item.name,
    brand: item.brand,
    packSize: item.packSize,
    price: item.price,
    parLevel: item.parLevel,
    score: Math.round(score * 10) / 10,
    sameBrand,
    samePackSize,
  };
}

export function buildPfgImportPreview(
  rows: PfgOrderGuideRow[],
  existingItems: PfgExistingItem[],
  defaultNamePolicy: PfgNamePolicy = "keep_existing",
): PfgPreviewRow[] {
  const byItemNumber = new Map(
    existingItems
      .filter((item) => item.itemNumber)
      .map((item) => [item.itemNumber as string, item]),
  );

  return rows.map((row) => {
    const exact = byItemNumber.get(row.itemNumber);
    if (exact) {
      return {
        row,
        classification: "exact" as const,
        existingItem: exact,
        candidates: [],
        defaultDecision: {
          itemNumber: row.itemNumber,
          action: "exact" as const,
          existingItemId: exact.id,
          namePolicy: defaultNamePolicy,
        },
      };
    }

    const candidates = existingItems
      .filter((item) => item.vendor === "PFG" && item.isActive)
      .map((item) => scorePfgReplacement(row, item))
      // Suggestions down to 44 are shown for human review only. Product-variant
      // evidence promotes likely manufacturer substitutions (almond→almond,
      // banana→banana) and penalizes incompatible variants (almond→oat).
      .filter((candidate) => candidate.score >= 44)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);

    const classification = candidates.length > 0 ? "review" as const : "new" as const;
    return {
      row,
      classification,
      candidates,
      defaultDecision: {
        itemNumber: row.itemNumber,
        // A soft-match suggestion is never applied automatically. The UI requires
        // an explicit merge/create/skip selection before final approval.
        action: classification === "review" ? "skip" as const : "create" as const,
        namePolicy: classification === "review" ? defaultNamePolicy : "use_uploaded" as const,
      },
    };
  });
}

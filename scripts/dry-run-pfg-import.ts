import fs from "node:fs";
import path from "node:path";
import { parsePfgCsv } from "../shared/pfgOrderGuide";
import { buildPfgImportPreview, type PfgExistingItem } from "../server/pfgReconciliation";

const csvPath = process.argv[2];
const catalogHtmlPath = process.argv[3];
if (!csvPath || !catalogHtmlPath) {
  throw new Error("Usage: tsx scripts/dry-run-pfg-import.ts <guide.csv> <production-pfg-response.html>");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const csvText = fs.readFileSync(path.resolve(csvPath), "utf8");
const parsed = parsePfgCsv(csvText);
const html = fs.readFileSync(path.resolve(catalogHtmlPath), "utf8");
const pre = html.match(/<pre>([\s\S]*?)<\/pre>/)?.[1];
if (!pre) throw new Error("Could not find production JSON payload in saved HTML");
const payload = JSON.parse(decodeHtml(pre));
const existingItems = payload.result.data.json as PfgExistingItem[];
const preview = buildPfgImportPreview(parsed.rows, existingItems, "keep_existing");

const exact = preview.filter((entry) => entry.classification === "exact");
const review = preview.filter((entry) => entry.classification === "review");
const newRows = preview.filter((entry) => entry.classification === "new");
const priceChanges = exact.filter((entry) => {
  const oldPrice = Number.parseFloat(entry.existingItem?.price ?? "0");
  const newPrice = Number.parseFloat(entry.row.price);
  return Math.abs(oldPrice - newPrice) >= 0.005;
});

console.log(JSON.stringify({
  file: path.basename(csvPath),
  headerRowIndex: parsed.headerRowIndex,
  validProductRows: parsed.rows.length,
  rejectedMetadataRows: parsed.rejectedRows,
  exactItemNumberMatches: exact.length,
  exactPriceChanges: priceChanges.length,
  replacementReviewRows: review.length,
  newRowsWithoutCandidates: newRows.length,
  defaultNamePolicy: "keep_existing",
}, null, 2));

console.log("\nUNMATCHED ROW REVIEW");
for (const entry of [...review, ...newRows]) {
  console.log(`PFG #${entry.row.itemNumber} | ${entry.row.name} | ${entry.row.brand} | ${entry.row.packSize} | $${entry.row.price}`);
  for (const candidate of entry.candidates) {
    console.log(`  candidate ID ${candidate.existingItemId} #${candidate.itemNumber ?? "—"} | ${candidate.name} | par ${candidate.parLevel ?? "0"} | score ${candidate.score}`);
  }
  console.log(`  default: ${entry.defaultDecision.action}`);
}

console.log("\nEXACT PRICE CHANGES");
for (const entry of priceChanges) {
  console.log(`#${entry.row.itemNumber} | ID ${entry.existingItem?.id} | ${entry.existingItem?.name} | $${entry.existingItem?.price} -> $${entry.row.price}`);
}

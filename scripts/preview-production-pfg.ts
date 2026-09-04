import fs from "node:fs";
import { parsePfgCsv } from "../shared/pfgOrderGuide";
import { previewPfgImport } from "../server/db";

const csvPath = process.argv[2];
if (!csvPath) {
  throw new Error("Usage: tsx scripts/preview-production-pfg.ts <order-guide.csv>");
}

const parsed = parsePfgCsv(fs.readFileSync(csvPath, "utf8"));
const preview = await previewPfgImport(parsed.rows);

const exact = preview.filter((entry) => entry.classification === "exact");
const review = preview.filter((entry) => entry.classification === "review");
const created = preview.filter((entry) => entry.classification === "new");

console.log(JSON.stringify({
  csvPath,
  headerRowIndex: parsed.headerRowIndex,
  rejectedRows: parsed.rejectedRows,
  validRows: parsed.rows.length,
  exactCount: exact.length,
  reviewCount: review.length,
  newCount: created.length,
  nonExact: [...review, ...created].map((entry) => ({
    itemNumber: entry.row.itemNumber,
    name: entry.row.name,
    brand: entry.row.brand,
    packSize: entry.row.packSize,
    price: entry.row.price,
    classification: entry.classification,
    candidates: entry.candidates.map((candidate) => ({
      existingItemId: candidate.existingItemId,
      itemNumber: candidate.itemNumber,
      name: candidate.name,
      brand: candidate.brand,
      packSize: candidate.packSize,
      parLevel: candidate.parLevel,
      score: candidate.score,
    })),
  })),
}, null, 2));

process.exit(0);

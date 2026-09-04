import fs from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { importPfgItems, previewPfgImport } from "../server/db";
import type { PfgApplyDecision } from "../server/pfgReconciliation";
import { parsePfgCsv } from "../shared/pfgOrderGuide";

const csvPath = process.argv[2];
if (!csvPath) throw new Error("Usage: tsx scripts/reconcile-sep3-pfg-production.ts <order-guide.csv>");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const EXPECTED_REPLACEMENTS: Record<string, { id: number; oldItemNumber: string; name: string; parLevel: string }> = {
  "605163": {
    id: 2,
    oldItemNumber: "593174",
    name: "Milk Almond Barista Unsweetened Original",
    parLevel: "2.00",
  },
  "821771": {
    id: 73,
    oldItemNumber: "960982",
    name: "Banana More Green",
    parLevel: "1.00",
  },
};

const ACCIDENTAL_WHERE = `
  id BETWEEN 300001 AND 300060
  AND vendor = 'Other'
  AND itemNumber IS NULL
  AND createdAt BETWEEN '2026-09-03 22:03:06' AND '2026-09-03 22:03:14'
`;

const parsed = parsePfgCsv(fs.readFileSync(csvPath, "utf8"));
if (parsed.headerRowIndex !== 7 || parsed.rejectedRows !== 2 || parsed.rows.length !== 141) {
  throw new Error(`Unexpected file shape: header=${parsed.headerRowIndex}, rejected=${parsed.rejectedRows}, valid=${parsed.rows.length}`);
}

const preview = await previewPfgImport(parsed.rows);
const exact = preview.filter((entry) => entry.classification === "exact");
const review = preview.filter((entry) => entry.classification === "review");
const newRows = preview.filter((entry) => entry.classification === "new");
if (exact.length !== 139 || review.length !== 2 || newRows.length !== 0) {
  throw new Error(`Unexpected preview: exact=${exact.length}, review=${review.length}, new=${newRows.length}`);
}

const decisions: PfgApplyDecision[] = preview.map((entry) => {
  if (entry.classification === "exact") return entry.defaultDecision;
  const approved = EXPECTED_REPLACEMENTS[entry.row.itemNumber];
  if (!approved) throw new Error(`Unapproved non-exact PFG #${entry.row.itemNumber}`);
  const candidate = entry.candidates.find((value) => value.existingItemId === approved.id);
  if (!candidate) throw new Error(`Approved target ${approved.id} is not a current candidate for PFG #${entry.row.itemNumber}`);
  return {
    itemNumber: entry.row.itemNumber,
    action: "merge",
    existingItemId: approved.id,
    namePolicy: "keep_existing",
  };
});

const connection = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  multipleStatements: true,
} as never);

try {
  const [guardRows] = await connection.query<RowDataPacket[]>(`
    SELECT
      COUNT(*) AS candidateCount,
      SUM(isActive = TRUE) AS activeCount,
      SUM(
        EXISTS (SELECT 1 FROM count_entries WHERE count_entries.itemId = items.id)
        OR EXISTS (SELECT 1 FROM catering_recipe_items WHERE catering_recipe_items.itemId = items.id)
        OR EXISTS (SELECT 1 FROM price_history WHERE price_history.itemId = items.id)
        OR EXISTS (SELECT 1 FROM invoice_lines WHERE invoice_lines.itemId = items.id)
        OR EXISTS (SELECT 1 FROM stock_events WHERE stock_events.itemId = items.id)
      ) AS referencedCount
    FROM items
    WHERE ${ACCIDENTAL_WHERE}
  `);
  const guard = guardRows[0];
  if (Number(guard.candidateCount) !== 60 || Number(guard.activeCount) !== 60 || Number(guard.referencedCount) !== 0) {
    throw new Error(`Accidental-row guard failed: ${JSON.stringify(guard)}`);
  }

  const [canonicalRows] = await connection.query<RowDataPacket[]>(`
    SELECT id, itemNumber, name, parLevel, vendor, isActive
    FROM items
    WHERE id IN (2, 73)
    ORDER BY id
  `);
  for (const expected of Object.values(EXPECTED_REPLACEMENTS)) {
    const current = canonicalRows.find((row) => Number(row.id) === expected.id);
    if (!current
      || current.itemNumber !== expected.oldItemNumber
      || current.name !== expected.name
      || String(current.parLevel) !== expected.parLevel
      || current.vendor !== "PFG"
      || !Boolean(current.isActive)) {
      throw new Error(`Canonical guard failed for item ${expected.id}: ${JSON.stringify(current)}`);
    }
  }

  const importResult = await importPfgItems(
    parsed.rows,
    undefined,
    "BEIGNETSNBREW-OrderGuide4735_PerformanceFoodservicePowell-56293820_09-03-2026.csv",
    decisions,
  );
  if (importResult.created !== 0 || importResult.replaced !== 2 || importResult.skipped !== 0) {
    throw new Error(`Unexpected import result: ${JSON.stringify(importResult)}`);
  }

  await connection.beginTransaction();
  try {
    const [secondGuardRows] = await connection.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS candidateCount
      FROM items
      WHERE ${ACCIDENTAL_WHERE}
        AND isActive = TRUE
        AND NOT EXISTS (SELECT 1 FROM count_entries WHERE count_entries.itemId = items.id)
        AND NOT EXISTS (SELECT 1 FROM catering_recipe_items WHERE catering_recipe_items.itemId = items.id)
        AND NOT EXISTS (SELECT 1 FROM price_history WHERE price_history.itemId = items.id)
        AND NOT EXISTS (SELECT 1 FROM invoice_lines WHERE invoice_lines.itemId = items.id)
        AND NOT EXISTS (SELECT 1 FROM stock_events WHERE stock_events.itemId = items.id)
    `);
    if (Number(secondGuardRows[0].candidateCount) !== 60) {
      throw new Error(`Cleanup guard changed after import: ${JSON.stringify(secondGuardRows[0])}`);
    }

    const [cleanupResult] = await connection.execute<mysql.ResultSetHeader>(`
      UPDATE items
      SET isActive = FALSE, updatedAt = CURRENT_TIMESTAMP
      WHERE ${ACCIDENTAL_WHERE}
        AND isActive = TRUE
        AND NOT EXISTS (SELECT 1 FROM count_entries WHERE count_entries.itemId = items.id)
        AND NOT EXISTS (SELECT 1 FROM catering_recipe_items WHERE catering_recipe_items.itemId = items.id)
        AND NOT EXISTS (SELECT 1 FROM price_history WHERE price_history.itemId = items.id)
        AND NOT EXISTS (SELECT 1 FROM invoice_lines WHERE invoice_lines.itemId = items.id)
        AND NOT EXISTS (SELECT 1 FROM stock_events WHERE stock_events.itemId = items.id)
    `);
    if (cleanupResult.affectedRows !== 60) {
      throw new Error(`Expected to deactivate 60 accidental rows; changed ${cleanupResult.affectedRows}`);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }

  const [verification] = await connection.query<RowDataPacket[]>(`
    SELECT
      (SELECT COUNT(*) FROM items WHERE isActive = TRUE) AS activeItemCount,
      (SELECT COUNT(*) FROM items WHERE isActive = TRUE AND vendor = 'PFG') AS activePfgCount,
      (SELECT COUNT(*) FROM items WHERE ${ACCIDENTAL_WHERE} AND isActive = TRUE) AS accidentalActive,
      (SELECT COUNT(*) FROM items WHERE ${ACCIDENTAL_WHERE} AND isActive = FALSE) AS accidentalInactive,
      (SELECT COUNT(*) FROM items WHERE vendor = 'PFG' AND itemNumber IN ('605163', '821771') AND isActive = TRUE) AS replacementNumbersActive
  `);
  const [finalCanonicals] = await connection.query<RowDataPacket[]>(`
    SELECT id, itemNumber, name, brand, packSize, price, parLevel, vendor, isActive
    FROM items
    WHERE id IN (2, 73)
    ORDER BY id
  `);

  const summary = {
    file: {
      headerRowIndex: parsed.headerRowIndex,
      rejectedRows: parsed.rejectedRows,
      validRows: parsed.rows.length,
    },
    preview: { exact: exact.length, review: review.length, new: newRows.length },
    approvedReplacements: Object.entries(EXPECTED_REPLACEMENTS).map(([itemNumber, value]) => ({ itemNumber, ...value })),
    importResult,
    cleanup: { deactivated: 60 },
    verification: verification[0],
    canonicalItems: finalCanonicals,
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await connection.end();
}

import fs from "node:fs";
import { sql } from "drizzle-orm";
import { getDb, importPfgItems, previewPfgImport } from "../server/db";
import type { PfgApplyDecision } from "../server/pfgReconciliation";
import { parsePfgCsv } from "../shared/pfgOrderGuide";

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

const ACCIDENTAL_WHERE = sql.raw(`
  id BETWEEN 300001 AND 300060
  AND vendor = 'Other'
  AND itemNumber IS NULL
  AND createdAt BETWEEN '2026-09-03 22:03:06' AND '2026-09-03 22:03:14'
`);

type QueryRow = Record<string, unknown>;

function rowsFrom<T extends QueryRow>(result: unknown): T[] {
  if (!Array.isArray(result) || !Array.isArray(result[0])) return [];
  return result[0] as T[];
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) throw new Error("Usage: tsx scripts/reconcile-sep3-pfg-production.ts <order-guide.csv>");

  console.log("[reconcile] Parsing and validating the PFG guide");
  const parsed = parsePfgCsv(fs.readFileSync(csvPath, "utf8"));
  if (parsed.headerRowIndex !== 7 || parsed.rejectedRows !== 2 || parsed.rows.length !== 141) {
    throw new Error(`Unexpected file shape: header=${parsed.headerRowIndex}, rejected=${parsed.rejectedRows}, valid=${parsed.rows.length}`);
  }

  console.log("[reconcile] Building a fresh production preview");
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

  const db = await getDb();
  if (!db) throw new Error("Production database is unavailable");

  console.log("[reconcile] Verifying the 60 accidental rows and all historical-reference guards");
  const guardResult = await db.execute(sql`
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
  const guard = rowsFrom<QueryRow>(guardResult)[0];
  if (!guard || Number(guard.candidateCount) !== 60 || Number(guard.activeCount) !== 60 || Number(guard.referencedCount) !== 0) {
    throw new Error(`Accidental-row guard failed: ${JSON.stringify(guard)}`);
  }

  const canonicalResult = await db.execute(sql`
    SELECT id, itemNumber, name, parLevel, vendor, isActive
    FROM items
    WHERE id IN (2, 73)
    ORDER BY id
  `);
  const canonicalRows = rowsFrom<QueryRow>(canonicalResult);
  for (const expected of Object.values(EXPECTED_REPLACEMENTS)) {
    const current = canonicalRows.find((row) => Number(row.id) === expected.id);
    if (!current
      || current.itemNumber !== expected.oldItemNumber
      || current.name !== expected.name
      || String(current.parLevel) !== expected.parLevel
      || current.vendor !== "PFG"
      || Number(current.isActive) !== 1) {
      throw new Error(`Canonical guard failed for item ${expected.id}: ${JSON.stringify(current)}`);
    }
  }

  console.log("[reconcile] Applying 139 exact matches and two approved replacements");
  const importResult = await importPfgItems(
    parsed.rows,
    undefined,
    "BEIGNETSNBREW-OrderGuide4735_PerformanceFoodservicePowell-56293820_09-03-2026.csv",
    decisions,
  );
  if (importResult.created !== 0 || importResult.replaced !== 2 || importResult.skipped !== 0) {
    throw new Error(`Unexpected import result: ${JSON.stringify(importResult)}`);
  }

  console.log("[reconcile] Retiring the 60 guarded accidental General-import rows");
  await db.transaction(async (tx) => {
    const secondGuardResult = await tx.execute(sql`
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
    const secondGuard = rowsFrom<QueryRow>(secondGuardResult)[0];
    if (!secondGuard || Number(secondGuard.candidateCount) !== 60) {
      throw new Error(`Cleanup guard changed after import: ${JSON.stringify(secondGuard)}`);
    }

    const cleanupResult = await tx.execute(sql`
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
    const header = Array.isArray(cleanupResult) ? cleanupResult[0] as unknown as { affectedRows?: number } : undefined;
    if (Number(header?.affectedRows) !== 60) {
      throw new Error(`Expected to deactivate 60 accidental rows; changed ${String(header?.affectedRows)}`);
    }
  });

  console.log("[reconcile] Verifying final catalog state");
  const verificationResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM items WHERE isActive = TRUE) AS activeItemCount,
      (SELECT COUNT(*) FROM items WHERE isActive = TRUE AND vendor = 'PFG') AS activePfgCount,
      (SELECT COUNT(*) FROM items WHERE ${ACCIDENTAL_WHERE} AND isActive = TRUE) AS accidentalActive,
      (SELECT COUNT(*) FROM items WHERE ${ACCIDENTAL_WHERE} AND isActive = FALSE) AS accidentalInactive,
      (SELECT COUNT(*) FROM items WHERE vendor = 'PFG' AND itemNumber IN ('605163', '821771') AND isActive = TRUE) AS replacementNumbersActive
  `);
  const finalCanonicalResult = await db.execute(sql`
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
    verification: rowsFrom<QueryRow>(verificationResult)[0],
    canonicalItems: rowsFrom<QueryRow>(finalCanonicalResult),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[reconcile] FAILED", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});

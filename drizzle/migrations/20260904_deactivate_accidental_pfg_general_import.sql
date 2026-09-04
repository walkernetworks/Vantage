-- Vantage production data repair for import batch 30001.
--
-- The Sep. 3, 2026 PFG order guide was incorrectly routed through the General
-- importer, creating item IDs 300001-300060 as vendor `Other` with no item
-- numbers. Run the corrected PFG import first. It will update 139 canonical PFG
-- records and create the two genuinely new PFG products with their item numbers.
--
-- This cleanup is intentionally guarded. It updates zero rows unless exactly 60
-- matching accidental rows still exist and none has acquired historical links.

START TRANSACTION;

SELECT COUNT(*) AS expected_accidental_rows
FROM items AS candidate
WHERE candidate.id BETWEEN 300001 AND 300060
  AND candidate.vendor = 'Other'
  AND candidate.itemNumber IS NULL
  AND candidate.createdAt BETWEEN '2026-09-03 22:03:06' AND '2026-09-03 22:03:14'
  AND NOT EXISTS (SELECT 1 FROM count_entries WHERE count_entries.itemId = candidate.id)
  AND NOT EXISTS (SELECT 1 FROM catering_recipe_items WHERE catering_recipe_items.itemId = candidate.id)
  AND NOT EXISTS (SELECT 1 FROM price_history WHERE price_history.itemId = candidate.id)
  AND NOT EXISTS (SELECT 1 FROM invoice_lines WHERE invoice_lines.itemId = candidate.id)
  AND NOT EXISTS (SELECT 1 FROM stock_events WHERE stock_events.itemId = candidate.id);

UPDATE items AS accidental
SET accidental.isActive = FALSE,
    accidental.updatedAt = CURRENT_TIMESTAMP
WHERE accidental.id BETWEEN 300001 AND 300060
  AND accidental.vendor = 'Other'
  AND accidental.itemNumber IS NULL
  AND accidental.createdAt BETWEEN '2026-09-03 22:03:06' AND '2026-09-03 22:03:14'
  AND NOT EXISTS (SELECT 1 FROM count_entries WHERE count_entries.itemId = accidental.id)
  AND NOT EXISTS (SELECT 1 FROM catering_recipe_items WHERE catering_recipe_items.itemId = accidental.id)
  AND NOT EXISTS (SELECT 1 FROM price_history WHERE price_history.itemId = accidental.id)
  AND NOT EXISTS (SELECT 1 FROM invoice_lines WHERE invoice_lines.itemId = accidental.id)
  AND NOT EXISTS (SELECT 1 FROM stock_events WHERE stock_events.itemId = accidental.id)
  AND (
    SELECT guarded.candidate_count
    FROM (
      SELECT COUNT(*) AS candidate_count
      FROM items AS candidate
      WHERE candidate.id BETWEEN 300001 AND 300060
        AND candidate.vendor = 'Other'
        AND candidate.itemNumber IS NULL
        AND candidate.createdAt BETWEEN '2026-09-03 22:03:06' AND '2026-09-03 22:03:14'
        AND NOT EXISTS (SELECT 1 FROM count_entries WHERE count_entries.itemId = candidate.id)
        AND NOT EXISTS (SELECT 1 FROM catering_recipe_items WHERE catering_recipe_items.itemId = candidate.id)
        AND NOT EXISTS (SELECT 1 FROM price_history WHERE price_history.itemId = candidate.id)
        AND NOT EXISTS (SELECT 1 FROM invoice_lines WHERE invoice_lines.itemId = candidate.id)
        AND NOT EXISTS (SELECT 1 FROM stock_events WHERE stock_events.itemId = candidate.id)
    ) AS guarded
  ) = 60;

SELECT ROW_COUNT() AS deactivated_rows;

COMMIT;

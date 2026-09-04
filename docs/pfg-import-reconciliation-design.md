# PFG Order-Guide Import and Reconciliation Design

## Goal

PFG order guides must be recognized deterministically, parsed without AI, matched by product number first, and reviewed before any identifier-replacement merge. Existing Vantage item records remain canonical so their par levels, thresholds, count mode, count history, invoice links, stock events, category, storage area, and notes are preserved.

## Detection and parsing

A CSV is PFG when a row within the first 20 non-empty rows contains the required columns `Product Description`, `Product Number`, `Pack Size`, and `Price`. `Custom Product Description` is optional. The parser must use that row as the header, not assume row one. Rows before it are document metadata and are ignored. Rows after it are accepted only when both a non-empty product description and a numeric product number are present. Footer lines, addresses, contacts, generation timestamps, disclaimers, and repeated headers are rejected automatically. PFG rows always use vendor `PFG`; they never pass through AI column mapping or enrichment.

The Sep. 3 file contains 141 valid product rows plus two footer rows. Of the 141 products, 139 product numbers already exist in the live PFG catalog and two numbers are new: `605163` (Califia almond milk) and `821771` (Del Monte banana).

## Preview classification

The server returns a preview rather than applying the file immediately. Each valid row receives one of these actions:

| Action | Rule | Default behavior |
|---|---|---|
| Exact product-number match | Same vendor and same `itemNumber` | Update price and current vendor metadata on the existing item |
| Suggested replacement | Product number is new, but deterministic name/brand/pack comparison finds candidates | Require an administrator to select the canonical item or keep it as new |
| New product | No approved existing candidate | Create a new PFG item with par zero |
| Invalid metadata | Missing/invalid product number or known metadata pattern | Skip; never create an item |

No fuzzy match is applied automatically. Candidate scoring is advisory only.

## Name policy

The default import policy is **Keep existing item names**. For exact matches and approved replacements, the established Vantage display name remains unchanged. The preview includes a global choice between **Keep existing names** and **Use uploaded PFG names**, plus a per-row override for approved replacements. New products necessarily use the uploaded name.

## Apply behavior

The apply operation runs transactionally. Exact product-number matches update the canonical row’s price, brand, pack size, case quantity, each price, and vendor while preserving its ID and operational settings. Approved identifier replacements additionally update the canonical row’s `itemNumber` to the new PFG number. Every real price change is recorded in `price_history`, and the import batch is logged as PFG.

The canonical item’s par level, order threshold, count mode, category, storage area, notes, count entries, catering references, invoice-line references, stock events, and historical price records are retained because the item ID does not change. Accidental duplicate rows are soft-deleted only after their lack of historical references is verified.

## Sep. 3 production repair

The production data repair will update all 139 exact item-number matches from the attached guide, retaining existing names by default. It will soft-delete the 60 rows accidentally created by batch `30001`, including eight metadata rows, after checking that they have no count, recipe, price-history, invoice-line, or stock-event references. The two genuinely unmatched PFG numbers will remain separate review items unless explicitly paired with an existing product. Missing products from the guide are not automatically deactivated.

The cleanup will be delivered as an auditable SQL data migration and executed in one transaction against the live TiDB database only after a dry-run report confirms affected row counts and reference safety.

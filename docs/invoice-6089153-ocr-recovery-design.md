# Invoice 6089153 OCR Recovery Design

## Scope

Invoice **6089153**, dated **2026-08-31**, is a PFG document with a printed subtotal of **$3,515.11**, tax of **$6.02**, total of **$3,521.13**, and a shipped-count control of **69**. The supplied photos visibly state that they are pages **1 of 3** and **2 of 3**. The system must therefore parse the photos accurately but must not apply the receipt until all product pages are available and document controls reconcile.

## Root cause

The two-stage parser currently gives priority to the largest Mistral HTML table on a page. On the supplied page two, a product grid and a category-recap/footer grid were effectively combined. Rows from the recap/footer grid were misclassified as products, including synthetic item keys `99979` and `14333056`. On another page, no usable HTML grid was selected, while the text-only model returned no usable rows. The arithmetic validation correctly retained the invoice as a pending draft rather than applying an incomplete delivery.

## Permanent recovery rules

| Stage | Rule | Safety consequence |
|---|---|---|
| Header extraction | Recover PFG invoice number and date from OCR markdown and, when available, the image-level structured response. | Header metadata survives table-parser fallbacks. |
| HTML-grid selection | Evaluate every OCR table as a candidate and score only rows that retain a valid item number, a same-row description, and a usable quantity/price/extension geometry. | A recap/footer table cannot outrank an actual product grid merely because it has more numeric rows. |
| Grid termination | Stop product-row parsing at PFG recap and footer headers such as `CAT #`, `DESCRIPTION / COST / TAX / TOTAL`, signature rows, and explicit invoice totals. | Category recap and document footer numbers cannot become inventory SKUs. |
| Vision fallback | If neither the selected HTML grid nor the text-to-JSON parse yields usable product rows, retry that page using the original image and the existing strict row schema. | Clear phone photos do not fail solely because table markup is incomplete. |
| Acceptance | Retain document controls as the hard gate. Product extensions and shipped quantity must reconcile to printed controls before a receipt can be applied. | OCR is never allowed to create inventory from a plausible but unverified parse. |
| Review | A failed parse remains a pending draft. The reviewer can correct the invoice header, map lines, and explicitly mark it reviewed; applied invoices require a valid number and printed invoice date. | Manual recovery is possible without automatic stock changes. |

## Handling this invoice

The current failed attempt has a stored pending draft but no retained source files because the older direct-upload flow does not persist images. The corrected uploader must be used with all three physical invoice pages. The already known header data may be recorded on the draft, but its delivery will remain pending until the complete three-page receipt passes reconciliation and the reviewer approves it.

## Regression coverage

Tests must include a table with valid PFG item rows followed by a `CAT #` recap table and a footer row containing numeric fields. The expected result is that only the true product rows remain. Tests must also assert that a page with no viable table candidate invokes the vision-fallback decision, while document total mismatches continue to block application.

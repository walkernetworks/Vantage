# Mistral OCR Structured Output Reference

Source: https://docs.mistral.ai/studio-api/document-processing/basic_ocr

The `mistral-ocr-latest` API supports `table_format: "html"` for separate HTML table output. The invoice parser uses this output because each HTML table row preserves the PFG item-row relationship across Item Number, quantity, description, price, and extension columns.

The API also documents `include_blocks: true` for page-level structural block bounding boxes and `confidence_scores_granularity: "word"` for word confidence data when supported by the selected OCR model. The parser requests these options for diagnostics while using HTML table rows as its primary deterministic geometry source.

Official documentation states that block extraction requires OCR 4 or newer. The implementation retains a controlled text/vision fallback when structured table data is unavailable, then applies server-side arithmetic and document-total validation before an invoice can be created.

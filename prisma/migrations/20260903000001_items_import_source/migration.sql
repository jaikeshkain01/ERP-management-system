-- Provenance stamp on items: BOM imports write the workbook / sheet label
-- into `import_source` when they create a child item. Surfaced in the items
-- list so operators can tell at a glance which items came in from which
-- spreadsheet vs. which were hand-added.
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS import_source TEXT;

-- ============================================================================
--  ADD-FORM P4b — items.generic_pn (industry-standard part number)
-- ============================================================================
-- Adds a distinct `generic_pn` column to the universal item master. This is
-- SEPARATE from `items.code`:
--   • `items.code`       — tenant-unique internal SKU (e.g. "AST-MSI-14")
--   • `items.generic_pn` — industry-standard or in-house generic part number
--                          (e.g. "10K-0603-1%", "TP-USB-A-M"). Optional.
--
-- Validation happens at the app layer: an item is valid iff at least ONE of
-- {generic_pn, any purchased variant's part_no} is present. The DB does not
-- enforce that — a strictly-manufactured asset (say a specific PC or fixture)
-- may need neither before its identity is finalised, and the item still needs
-- to be creatable to hold that state.
--
-- BACKFILL:
--   Legacy component-backed items copy `components.generic_pn` → items.generic_pn
--   1:1. Product- and PCB-revision-backed items leave it NULL (they never had
--   a generic PN concept).
--
-- UNIQUENESS:
--   Per tenant, per generic_pn, only among live rows and only when non-null.
--   Two items may both leave it NULL; a shared explicit value is a real conflict.
--
-- Apply with:  npx prisma migrate deploy

ALTER TABLE items ADD COLUMN generic_pn text;

UPDATE items i
   SET generic_pn = c.generic_pn
  FROM components c
 WHERE c.id = i.id
   AND c.generic_pn IS NOT NULL
   AND c.generic_pn <> ''
   AND i.generic_pn IS NULL;

-- Partial unique index — mirrors the shape used for `items.code`.
CREATE UNIQUE INDEX uq_items_generic_pn
  ON items (company_id, generic_pn)
  WHERE deleted_at IS NULL AND generic_pn IS NOT NULL;

CREATE INDEX ix_items_generic_pn
  ON items (company_id, generic_pn)
  WHERE deleted_at IS NULL;

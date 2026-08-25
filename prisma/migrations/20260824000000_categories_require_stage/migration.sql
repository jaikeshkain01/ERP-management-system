-- ============================================================================
--  Slice 1 — every item_category carries a stage (default_item_type)
-- ============================================================================
-- Categories are now partitioned by stage: the add-form's category picker
-- filters to categories whose `default_item_type` matches the chosen stage
-- (Raw / Semi-assembled / Assembled / Consumable / Asset / Packaging).
--
-- This migration:
--   1. Backfills any pre-existing NULL rows so the constraint can hold.
--      The only known offender is a stray "Laptop" category (asset).
--      Any other stray inline-added row falls back to `raw`.
--   2. Adds NOT NULL on default_item_type going forward.
--   3. Seeds two new stage-partitioned PCB categories on every company:
--      "Bare PCBs" (raw) and "Populated PCBs" (semi_assembled). Idempotent
--      via existing (company_id, path) partial unique index.
--
-- Apply with:  npx prisma migrate deploy


-- 1) Backfill NULLs. Name-based hints first, then a safe default.
UPDATE item_categories
   SET default_item_type = 'asset'::item_type
 WHERE default_item_type IS NULL
   AND deleted_at IS NULL
   AND lower(name) IN ('laptop', 'laptops', 'monitor', 'monitors', 'peripheral', 'peripherals', 'tool', 'tools', 'asset', 'assets');

UPDATE item_categories
   SET default_item_type = 'raw'::item_type
 WHERE default_item_type IS NULL
   AND deleted_at IS NULL;


-- 2) Constraint. Every category must belong to exactly one stage.
ALTER TABLE item_categories
  ALTER COLUMN default_item_type SET NOT NULL;


-- 3) Seed "Bare PCBs" (raw) + "Populated PCBs" (semi_assembled) for every
--    company. ON CONFLICT DO NOTHING against the existing partial unique
--    index (company_id, path) keeps this idempotent.
INSERT INTO item_categories (company_id, name, slug, path, default_item_type, sort_order)
SELECT co.id, 'Bare PCBs', 'bare-pcbs', 'bare-pcbs', 'raw'::item_type,
       COALESCE((SELECT MAX(sort_order) + 1 FROM item_categories WHERE company_id = co.id AND parent_id IS NULL), 0)
FROM companies co
ON CONFLICT DO NOTHING;

INSERT INTO item_categories (company_id, name, slug, path, default_item_type, sort_order)
SELECT co.id, 'Populated PCBs', 'populated-pcbs', 'populated-pcbs', 'semi_assembled'::item_type,
       COALESCE((SELECT MAX(sort_order) + 1 FROM item_categories WHERE company_id = co.id AND parent_id IS NULL), 0)
FROM companies co
ON CONFLICT DO NOTHING;

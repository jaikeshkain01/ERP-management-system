-- ============================================================================
--  Seed "PCBs" (assembled) under Finished Products
-- ============================================================================
-- A PCB isn't always a sub-assembly — a stand-alone board can be a finished
-- good the company ships as-is. This adds a PCBs leaf under the existing
-- Finished Products parent (assembled stage) alongside Devices / Panels /
-- Displays / Accessories.
--
-- Distinct from the "Populated PCBs" node under Sub-Assemblies
-- (semi_assembled, seeded by 20260827000001) — that one is for boards that
-- go INTO a bigger product. This one is for boards SOLD as the product.
--
-- Both can coexist per tenant; the picker on the add-item form filters by
-- `default_item_type` so users only see the stage-appropriate one.
--
-- Idempotent — ON CONFLICT DO NOTHING against the existing partial unique
-- index on (company_id, path). Safe to re-run.
--
-- Apply with:  npx prisma migrate deploy

INSERT INTO item_categories (company_id, parent_id, name, slug, path, default_item_type, sort_order)
SELECT p.company_id, p.id, 'PCBs', 'pcbs', p.slug || '/pcbs', 'assembled'::item_type, 4
  FROM item_categories p
 WHERE p.slug = 'finished-products' AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

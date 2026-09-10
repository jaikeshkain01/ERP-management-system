-- ============================================================================
--  Seed "Imported PCBs" subcategory under "Sub-Assemblies"
-- ============================================================================
-- Adds a stable landing category for parents created by the BOM importer so
-- imported sub-assemblies (e.g. AUDIOBOARD2 from BOM-PCB-SSCE.xlsx) all land
-- in one predictable bucket. Sits alongside the existing children:
--
--   Sub-Assemblies (sub_assembly)
--     ├── Cable Harnesses
--     ├── Modules
--     ├── Mechanical Sub-Assemblies
--     ├── Populated PCBs
--     └── Imported PCBs           ← this migration
--
-- Idempotent via ON CONFLICT DO NOTHING against the (company_id, path)
-- partial unique index — safe to re-run and safe on tenants that already
-- have this node from an earlier back-fill.

INSERT INTO item_categories (company_id, parent_id, name, slug, path, default_item_type, sort_order)
SELECT p.company_id, p.id, 'Imported PCBs', 'imported-pcbs',
       p.slug || '/imported-pcbs', 'sub_assembly'::item_type,
       COALESCE((SELECT MAX(sort_order) + 1
                   FROM item_categories
                  WHERE company_id = p.company_id AND parent_id = p.id), 0)
FROM item_categories p
WHERE p.slug = 'sub-assemblies'
  AND p.parent_id IS NULL
  AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

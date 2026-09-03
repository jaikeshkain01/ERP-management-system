-- ============================================================================
--  Seed universal parent categories for Semi-Assembled and Assembled items
-- ============================================================================
-- Extends the existing `item_categories` tree with two new top-level parents
-- so the category picker on the add-item form has stage-appropriate defaults
-- for assemblies, matching the pattern already used for raw electronics
-- (Passive → Resistance/Capacitor/…).
--
-- Everything below is idempotent (ON CONFLICT DO NOTHING against the existing
-- partial unique index on (company_id, path)) and runs per-company, so it is
-- safe to re-run and safe on tenants that already have any of these nodes.
--
--   Sub-Assemblies (semi_assembled)
--     ├── Cable Harnesses
--     ├── Modules
--     └── Mechanical Sub-Assemblies
--   (existing "Populated PCBs" is re-parented under "Sub-Assemblies" — its
--    path becomes "sub-assemblies/populated-pcbs")
--
--   Finished Products (assembled)
--     ├── Devices
--     ├── Panels
--     ├── Displays
--     └── Accessories
--
-- Enforcement is intentionally SOFT — the item form's category picker filters
-- by `default_item_type` so a Semi-assembled item only sees the assemblies
-- branch. The DB does not reject a cross-stage assignment; that stays a UX
-- guardrail for now (upgrade to a check constraint in a later slice if abuse
-- shows up in the audit log).
--
-- Apply with:  npx prisma migrate deploy


-- 1) Top-level parents ---------------------------------------------------------
INSERT INTO item_categories (company_id, parent_id, name, slug, path, default_item_type, sort_order)
SELECT co.id, NULL::uuid, v.name, v.slug, v.slug, v.stage::item_type,
       COALESCE((SELECT MAX(sort_order) + 1 FROM item_categories WHERE company_id = co.id AND parent_id IS NULL), 0)
FROM companies co
CROSS JOIN (VALUES
  ('Sub-Assemblies',   'sub-assemblies',   'semi_assembled'),
  ('Finished Products','finished-products','assembled')
) AS v(name, slug, stage)
ON CONFLICT DO NOTHING;


-- 2) Children under "Sub-Assemblies" ------------------------------------------
INSERT INTO item_categories (company_id, parent_id, name, slug, path, default_item_type, sort_order)
SELECT p.company_id, p.id, v.name, v.slug, p.slug || '/' || v.slug, 'semi_assembled'::item_type, v.ord
FROM item_categories p
JOIN (VALUES
  ('Cable Harnesses',         'cable-harnesses',        0),
  ('Modules',                 'modules',                1),
  ('Mechanical Sub-Assemblies','mechanical',            2)
) AS v(name, slug, ord) ON TRUE
WHERE p.slug = 'sub-assemblies' AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;


-- 3) Children under "Finished Products" ---------------------------------------
INSERT INTO item_categories (company_id, parent_id, name, slug, path, default_item_type, sort_order)
SELECT p.company_id, p.id, v.name, v.slug, p.slug || '/' || v.slug, 'assembled'::item_type, v.ord
FROM item_categories p
JOIN (VALUES
  ('Devices',     'devices',     0),
  ('Panels',      'panels',      1),
  ('Displays',    'displays',    2),
  ('Accessories', 'accessories', 3)
) AS v(name, slug, ord) ON TRUE
WHERE p.slug = 'finished-products' AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;


-- 4) Re-parent the existing "Populated PCBs" node under "Sub-Assemblies". The
--    node was seeded as a flat top-level by 20260824000000; nesting it now
--    keeps the semi-assembled branch coherent. Path is rebuilt to
--    'sub-assemblies/populated-pcbs' (materialised path pattern used by every
--    other node). Idempotent: skipped when already parented.
UPDATE item_categories ch
SET parent_id = p.id,
    path = p.slug || '/' || ch.slug,
    updated_at = now()
FROM item_categories p
WHERE p.company_id = ch.company_id
  AND p.slug = 'sub-assemblies'
  AND p.deleted_at IS NULL
  AND ch.slug = 'populated-pcbs'
  AND ch.deleted_at IS NULL
  AND ch.parent_id IS NULL;

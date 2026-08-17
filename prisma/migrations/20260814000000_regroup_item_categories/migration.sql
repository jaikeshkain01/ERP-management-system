-- ============================================================================
--  REGROUP ITEM CATEGORIES into a 2-level Category → Subcategory tree
-- ============================================================================
-- The 2A backfill created every existing category as a flat top-level node.
-- This migration nests them under standard electronics parent categories so the
-- Category → Subcategory cascade is populated.
--
-- IMPORTANT: no component rows change. Components link to a category by id
-- (category_id); here we only set each leaf node's parent_id + path, and create
-- the few new parent nodes. A component filed under a node that becomes a parent
-- (e.g. "Passive") stays linked to it and still matches parent-level filters.
--
-- Runs per-company (keyed by slug within company_id); companies that don't have a
-- given slug are simply skipped. Safe to re-run (parent creation is guarded, the
-- re-parent UPDATE is idempotent; only the Protection→Circuit Protection rename
-- is one-way).
--
-- Apply with:  npx prisma migrate deploy

-- 1) Create the NEW parent categories (one per company that has any intended
--    child), skipping any that already exist.
INSERT INTO item_categories (company_id, parent_id, name, slug, path, default_item_type, created_at, updated_at)
SELECT DISTINCT c.company_id, NULL::uuid, v.name, v.slug, v.slug, 'raw'::item_type, now(), now()
FROM (VALUES
  ('Magnetics'::text,        'magnetics'::text,        ARRAY['transformer','choke-coil','ferrite-beed']::text[]),
  ('Semiconductors',         'semiconductors',         ARRAY['ic','diode','mosfet']),
  ('Electromechanical',      'electromechanical',      ARRAY['connector','crystal']),
  ('RF & Wireless',          'rf-wireless',            ARRAY['rf'])
) AS v(name, slug, children)
JOIN item_categories c ON c.slug = ANY(v.children) AND c.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM item_categories p
  WHERE p.company_id = c.company_id AND p.slug = v.slug AND p.deleted_at IS NULL
);

-- 2) Rename the existing "Protection" node → "Circuit Protection" (it becomes the
--    parent for Mov). Skipped if a circuit-protection node already exists.
UPDATE item_categories ic
SET name = 'Circuit Protection', slug = 'circuit-protection', path = 'circuit-protection', updated_at = now()
WHERE ic.slug = 'protection' AND ic.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM item_categories x
    WHERE x.company_id = ic.company_id AND x.slug = 'circuit-protection' AND x.deleted_at IS NULL
  );

-- 3) Re-parent each leaf under its new parent: set parent_id and the materialised
--    path (parent_slug/child_slug). Parents that don't exist in a company simply
--    don't match, leaving those children untouched.
UPDATE item_categories ch
SET parent_id = p.id, path = p.slug || '/' || ch.slug, updated_at = now()
FROM item_categories p
WHERE p.company_id = ch.company_id AND p.deleted_at IS NULL AND ch.deleted_at IS NULL
  AND ch.id <> p.id
  AND (
    (p.slug = 'passive'          AND ch.slug IN ('resistance','capacitor','inductor')) OR
    (p.slug = 'magnetics'        AND ch.slug IN ('transformer','choke-coil','ferrite-beed')) OR
    (p.slug = 'semiconductors'   AND ch.slug IN ('ic','diode','mosfet')) OR
    (p.slug = 'optoelectronics'  AND ch.slug IN ('led')) OR
    (p.slug = 'electromechanical' AND ch.slug IN ('connector','crystal')) OR
    (p.slug = 'circuit-protection' AND ch.slug IN ('mov')) OR
    (p.slug = 'rf-wireless'      AND ch.slug IN ('rf'))
  );

-- "Component" is intentionally left as a top-level (generic catch-all) node.

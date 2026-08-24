-- ============================================================================
--  F2 verification — every source row must have a mirror in items/item_variants.
--   psql "$DATABASE_URL" -f prisma/migrations/20260819000001_items_backfill/verify.sql
--
-- Every query below is written to return ZERO ROWS on success (empty = clean).
-- Anything returned = orphan / mismatch, investigate before proceeding to F3.
-- ============================================================================

-- 1) Every component (incl. soft-deleted) has an item mirror with same id. ----
SELECT c.id, c.company_id, c.generic_pn, c.name, 'missing item mirror' AS issue
FROM components c
WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = c.id);

-- 2) Every component_brand_variant has an item_variants mirror with same id. --
SELECT cbv.id, cbv.company_id, cbv.component_id, 'missing item_variant mirror' AS issue
FROM component_brand_variants cbv
WHERE EXISTS (SELECT 1 FROM items i WHERE i.id = cbv.component_id)
  AND NOT EXISTS (SELECT 1 FROM item_variants v WHERE v.id = cbv.id);

-- 3) Every product has an item mirror. ---------------------------------------
SELECT p.id, p.company_id, p.code, p.name, 'missing item mirror' AS issue
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = p.id);

-- 4) Every product-item has exactly one manufactured variant. ----------------
SELECT p.id, p.code, count(v.id) AS variant_count, 'expected 1 manufactured variant' AS issue
FROM products p
JOIN items i ON i.id = p.id
LEFT JOIN item_variants v ON v.item_id = p.id AND v.source_kind = 'manufactured'
GROUP BY p.id, p.code
HAVING count(v.id) <> 1;

-- 5) Every pcb_revision has an item mirror. ----------------------------------
SELECT pr.id, pr.company_id, pr.rev, 'missing item mirror' AS issue
FROM pcb_revisions pr
WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = pr.id);

-- 6) Every pcb_revision-item has exactly one manufactured variant. -----------
SELECT pr.id, pr.rev, count(v.id) AS variant_count, 'expected 1 manufactured variant' AS issue
FROM pcb_revisions pr
JOIN items i ON i.id = pr.id
LEFT JOIN item_variants v ON v.item_id = pr.id AND v.source_kind = 'manufactured'
GROUP BY pr.id, pr.rev
HAVING count(v.id) <> 1;

-- 7) Every item_type category matches its source: -----------------------------
--    - components → 'raw' (or the pre-existing item_type set by 20260813000000)
--    - products   → 'assembled'
--    - pcb_revs   → 'semi_assembled'
SELECT p.id, p.code, i.item_type, 'product item_type should be assembled' AS issue
FROM products p JOIN items i ON i.id = p.id
WHERE i.item_type <> 'assembled';

SELECT pr.id, pr.rev, i.item_type, 'pcb_revision item_type should be semi_assembled' AS issue
FROM pcb_revisions pr JOIN items i ON i.id = pr.id
WHERE i.item_type <> 'semi_assembled';

SELECT c.id, c.generic_pn, i.item_type, c.item_type AS component_item_type, 'item_type drift from source' AS issue
FROM components c JOIN items i ON i.id = c.id
WHERE i.item_type <> c.item_type;

-- 8) Codes are unique per tenant (partial unique enforces this — this query
--    just double-checks and surfaces the offending rows if the index were
--    ever dropped).
SELECT company_id, code, count(*) AS n
FROM items
WHERE deleted_at IS NULL
GROUP BY company_id, code
HAVING count(*) > 1;

-- 9) Manufactured variants NEVER carry a brand (CHECK ck_iv_brand_matches_source
--    enforces this; the query surfaces any drift).
SELECT id, item_id, brand_id, 'manufactured variant must have NULL brand_id' AS issue
FROM item_variants
WHERE source_kind = 'manufactured' AND brand_id IS NOT NULL;

-- 10) Purchased variants ALWAYS carry a brand.
SELECT id, item_id, 'purchased variant must have a brand_id' AS issue
FROM item_variants
WHERE source_kind = 'purchased' AND brand_id IS NULL;

-- 11) Every item that has any variants has exactly one default. --------------
--     (Items with zero variants — a defined-but-not-yet-sourced item — legally
--      have no default; the partial unique index allows this.)
SELECT i.id, i.code,
       count(v.id) FILTER (WHERE v.is_default AND v.deleted_at IS NULL) AS default_count,
       count(v.id) FILTER (WHERE v.deleted_at IS NULL) AS active_variant_count,
       'expected 1 default when active variants exist' AS issue
FROM items i
LEFT JOIN item_variants v ON v.item_id = i.id
GROUP BY i.id, i.code
HAVING count(v.id) FILTER (WHERE v.deleted_at IS NULL) > 0
   AND count(v.id) FILTER (WHERE v.is_default AND v.deleted_at IS NULL) <> 1;

-- 12) Summary counts (informational — always returns one row). ---------------
-- Not an assertion; run to see the shape of the backfill.
SELECT
  (SELECT count(*) FROM components)                                          AS src_components,
  (SELECT count(*) FROM component_brand_variants)                            AS src_component_variants,
  (SELECT count(*) FROM products)                                            AS src_products,
  (SELECT count(*) FROM pcb_revisions)                                       AS src_pcb_revisions,
  (SELECT count(*) FROM items WHERE item_type = 'raw')                       AS items_raw,
  (SELECT count(*) FROM items WHERE item_type = 'assembled')                 AS items_assembled,
  (SELECT count(*) FROM items WHERE item_type = 'semi_assembled')            AS items_semi_assembled,
  (SELECT count(*) FROM items)                                               AS items_total,
  (SELECT count(*) FROM item_variants WHERE source_kind = 'purchased')       AS iv_purchased,
  (SELECT count(*) FROM item_variants WHERE source_kind = 'manufactured')    AS iv_manufactured,
  (SELECT count(*) FROM item_variants)                                       AS iv_total;
-- expected:
--   items_raw            = src_components               (every component mirrored)
--   items_assembled      = src_products                  (every product mirrored)
--   items_semi_assembled = src_pcb_revisions             (every pcb_rev mirrored)
--   iv_purchased         = src_component_variants        (every brand-variant mirrored)
--   iv_manufactured      = src_products + src_pcb_revs   (one per manufactured item)

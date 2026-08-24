-- ============================================================================
--  F3 verification — every ledger/balance/lot/move row has both variant
--  columns populated and they hold the same uuid.
--   psql "$DATABASE_URL" -f prisma/migrations/20260819000002_ledger_item_variant_dual_write/verify.sql
--
-- Queries 1–7 should each return ZERO ROWS on success.
-- Query 8 is informational: a rollup keyed on item_variant_id must match the
--   same rollup keyed on component_brand_variant_id (any single row → drift).
-- ============================================================================

-- 1) No null item_variant_id anywhere (NOT NULL enforces this — belt+braces). ---
SELECT 'inventory_transactions' AS tbl, count(*) AS null_rows
FROM inventory_transactions WHERE item_variant_id IS NULL
HAVING count(*) > 0
UNION ALL
SELECT 'inventory_balances', count(*)
FROM inventory_balances WHERE item_variant_id IS NULL
HAVING count(*) > 0
UNION ALL
SELECT 'item_lots', count(*)
FROM item_lots WHERE item_variant_id IS NULL
HAVING count(*) > 0
UNION ALL
SELECT 'production_material_moves', count(*)
FROM production_material_moves WHERE item_variant_id IS NULL
HAVING count(*) > 0;

-- 2) item_variant_id == component_brand_variant_id on every existing row. ------
--    (Divergence is legal in the future when manufactured items land, but at
--     F3-time there is no such row yet.)
SELECT id, item_variant_id, component_brand_variant_id, 'inv_txn drift' AS issue
FROM inventory_transactions
WHERE item_variant_id <> component_brand_variant_id;

SELECT id, item_variant_id, component_brand_variant_id, 'inv_bal drift' AS issue
FROM inventory_balances
WHERE item_variant_id <> component_brand_variant_id;

SELECT id, item_variant_id, component_brand_variant_id, 'item_lots drift' AS issue
FROM item_lots
WHERE item_variant_id <> component_brand_variant_id;

SELECT id, item_variant_id, component_brand_variant_id, 'pmm drift' AS issue
FROM production_material_moves
WHERE item_variant_id <> component_brand_variant_id;

-- 3) Every item_variant_id resolves to a live row in item_variants. ------------
SELECT it.id, it.item_variant_id, 'orphan item_variant_id in inv_txn' AS issue
FROM inventory_transactions it
WHERE NOT EXISTS (SELECT 1 FROM item_variants v WHERE v.id = it.item_variant_id);

SELECT ib.id, ib.item_variant_id, 'orphan item_variant_id in inv_bal' AS issue
FROM inventory_balances ib
WHERE NOT EXISTS (SELECT 1 FROM item_variants v WHERE v.id = ib.item_variant_id);

-- 4) BEFORE INSERT trigger is attached on all three source tables. -------------
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_name IN (
  'trg_inv_txn_sync_item_variant',
  'trg_item_lots_sync_item_variant',
  'trg_pmm_sync_item_variant'
)
ORDER BY event_object_table;
-- expected: 3 rows

-- 5) FK constraints exist on all four tables. ---------------------------------
SELECT conname, conrelid::regclass AS tbl
FROM pg_constraint
WHERE conname IN (
  'fk_inv_txn_item_variant',
  'fk_inv_bal_item_variant',
  'fk_item_lots_item_variant',
  'fk_pmm_item_variant'
)
ORDER BY conname;
-- expected: 4 rows

-- 6) apply_inventory_txn now references item_variant_id (source-level check). --
SELECT pg_get_functiondef(oid) LIKE '%item_variant_id%' AS ok
FROM pg_proc WHERE proname = 'apply_inventory_txn';
-- expected: ok = t

-- 7) The mirror unique index on balances exists. -------------------------------
SELECT indexname FROM pg_indexes
WHERE indexname = 'uq_inventory_balances_item_variant_location';
-- expected: 1 row

-- 8) SEMANTIC: same rollups from either variant column. -----------------------
--     Any row → drift between the two identity columns for that variant.
SELECT * FROM (
  SELECT ib.location_id,
         a.total AS via_component_brand,
         b.total AS via_item_variant
  FROM (
    SELECT component_brand_variant_id, location_id, sum(on_hand) AS total
    FROM inventory_balances GROUP BY component_brand_variant_id, location_id
  ) a
  FULL OUTER JOIN (
    SELECT item_variant_id, location_id, sum(on_hand) AS total
    FROM inventory_balances GROUP BY item_variant_id, location_id
  ) b ON a.component_brand_variant_id = b.item_variant_id AND a.location_id = b.location_id
  JOIN inventory_balances ib ON ib.component_brand_variant_id = COALESCE(a.component_brand_variant_id, b.item_variant_id)
                              AND ib.location_id = COALESCE(a.location_id, b.location_id)
) x
WHERE via_component_brand IS DISTINCT FROM via_item_variant
LIMIT 20;
-- expected: 0 rows


-- ── SMOKE TEST (optional; uncomment to run) ──────────────────────────────────
-- Prove the BEFORE INSERT trigger auto-populates item_variant_id when a new
-- inventory_transactions row is written WITHOUT it (i.e. every existing
-- application code path). Uses the first live variant + first live bin to
-- keep the FK+RLS predicates happy; rolls back so nothing sticks.
--
-- BEGIN;
--   SET LOCAL app.current_company_id = (SELECT company_id FROM component_brand_variants
--                                       WHERE deleted_at IS NULL LIMIT 1)::text;
--   SET LOCAL app.current_user_id = (SELECT id FROM users LIMIT 1)::text;
--
--   WITH pick AS (
--     SELECT cbv.company_id, cbv.id AS variant_id, sl.warehouse_id, sl.id AS location_id
--     FROM component_brand_variants cbv
--     JOIN storage_locations sl ON sl.company_id = cbv.company_id
--                               AND sl.kind = 'bin' AND sl.deleted_at IS NULL
--     WHERE cbv.deleted_at IS NULL
--     LIMIT 1
--   )
--   INSERT INTO inventory_transactions
--     (company_id, type, component_brand_variant_id, warehouse_id, location_id, qty_delta, reason)
--   SELECT company_id, 'ADJUSTMENT', variant_id, warehouse_id, location_id, 0, 'F3 smoke test'
--   FROM pick
--   RETURNING id, component_brand_variant_id, item_variant_id,
--             (component_brand_variant_id = item_variant_id) AS auto_populated;
--   -- expected: auto_populated = true
-- ROLLBACK;

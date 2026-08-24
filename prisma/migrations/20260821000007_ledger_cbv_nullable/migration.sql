-- ============================================================================
--  F5.4 — Ledger keys on `item_variant_id`; CBV becomes optional
-- ============================================================================
-- The load-bearing slice of the F5 cutover. After this migration:
--
--   • `component_brand_variant_id` is NULLABLE on all four ledger tables
--     (inventory_transactions, inventory_balances, item_lots,
--     production_material_moves). For purchased items it stays populated
--     automatically via the sync trigger (F5.3 reverse branch). For
--     manufactured items — products, PCB revisions, any pure-universal
--     item without a CBV — it stays NULL. Rows are now identified by
--     `item_variant_id`, which is NOT NULL and was populated for every
--     existing row by F3.
--
--   • `apply_inventory_txn()` — the projection trigger that maintains
--     `inventory_balances` — flips its ON CONFLICT target from
--     `(component_brand_variant_id, location_id)` to
--     `(item_variant_id, location_id)`. The `uq_inventory_balances_item_variant_location`
--     unique index that backs this switch was created in F3; every existing
--     balance row has IV == CBV, so the switch dedupes to the same partition.
--
-- Non-breaking:
--   • Every existing INSERT path that only sets CBV continues to work —
--     the sync trigger's forward branch fills IV first, and the projection
--     uses IV going forward. The pre-existing UNIQUE (CBV, location_id) on
--     `inventory_balances` remains and still holds for purchased items
--     (Postgres treats NULL entries in a UNIQUE index as distinct, so
--     multiple NULL-CBV manufactured-item balances at the same location
--     coexist safely).
--   • Every existing SELECT keyed on CBV still returns the same rows for
--     component-backed items. Manufactured items were previously invisible
--     to those queries (couldn't be inserted at all) — that stays true.
--
-- Apply with:  npx prisma migrate deploy


-- ── 1) Relax NOT NULL on component_brand_variant_id (four ledger tables) ─────
ALTER TABLE inventory_transactions      ALTER COLUMN component_brand_variant_id DROP NOT NULL;
ALTER TABLE inventory_balances          ALTER COLUMN component_brand_variant_id DROP NOT NULL;
ALTER TABLE item_lots                   ALTER COLUMN component_brand_variant_id DROP NOT NULL;
ALTER TABLE production_material_moves   ALTER COLUMN component_brand_variant_id DROP NOT NULL;


-- ── 2) Flip apply_inventory_txn to ON CONFLICT (item_variant_id, location_id) ─
-- The function is otherwise unchanged from F3: it still projects both columns
-- into inventory_balances. The only difference is which unique key drives the
-- upsert. Keying on IV is required because CBV can now be NULL for
-- manufactured items, and multiple NULL rows would not collide on the old
-- key even when the item_variant they belong to is the same.
CREATE OR REPLACE FUNCTION apply_inventory_txn() RETURNS trigger AS $$
BEGIN
  INSERT INTO inventory_balances (
    company_id, component_brand_variant_id, item_variant_id,
    warehouse_id, location_id, on_hand
  )
  VALUES (
    NEW.company_id, NEW.component_brand_variant_id, NEW.item_variant_id,
    NEW.warehouse_id, NEW.location_id, NEW.qty_delta
  )
  ON CONFLICT (item_variant_id, location_id)
  DO UPDATE SET
    on_hand                   = inventory_balances.on_hand + EXCLUDED.on_hand,
    -- Defensive COALESCE: if a legacy row somehow lacks CBV, fill it in when
    -- a subsequent INSERT provides one; never overwrite an existing CBV
    -- (purchased items keep the stable id F2 assigned).
    component_brand_variant_id = COALESCE(inventory_balances.component_brand_variant_id, EXCLUDED.component_brand_variant_id),
    updated_at                 = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

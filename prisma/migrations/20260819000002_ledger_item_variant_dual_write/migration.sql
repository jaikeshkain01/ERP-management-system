-- ============================================================================
--  F3 — LEDGER GAINS item_variant_id (dual-column, dual-write via trigger)
-- ============================================================================
-- Third step of the universal-item transformation (project_universal_item).
-- After F2 mirrored every legacy row into `items` / `item_variants`, this
-- migration teaches the LEDGER to speak the new language:
--   • inventory_transactions       — the immutable movement journal
--   • inventory_balances           — projection maintained by apply_inventory_txn
--   • item_lots                    — per-batch metadata
--   • production_material_moves    — allocation/consumption bridge
--
-- DUAL-WRITE STRATEGY:
--   Instead of touching every write path in application code, we install a
--   BEFORE INSERT trigger `sync_item_variant_id` on the three source tables
--   (transactions, item_lots, material_moves) that copies
--   `component_brand_variant_id` → `item_variant_id` when the latter is unset.
--   Every existing INSERT — Prisma-typed or raw SQL — keeps working unchanged
--   and now populates both columns. The `apply_inventory_txn` projection
--   trigger is updated separately to propagate item_variant_id into
--   `inventory_balances`.
--
--   This is safe because F2 reused `component_brand_variants.id` as
--   `item_variants.id`, so the two columns hold the SAME uuid for every
--   purchased-variant row. Manufactured-variant rows have no
--   `component_brand_variant_id` (its NOT NULL will be relaxed in a later
--   feature, along with the trigger's fallback direction).
--
-- POST-CONDITION:
--   Every row in the four tables has BOTH columns populated with equal uuids.
--   Queries that key on `item_variant_id` return identical numbers to queries
--   that key on `component_brand_variant_id`. This is the F3 exit criterion.
--
-- Apply with:  npx prisma migrate deploy


-- ── 1) Add nullable item_variant_id columns ─────────────────────────────────
-- Nullable at first so we can add-FK / backfill / then set NOT NULL without
-- a chicken-and-egg. RESTRICT on delete matches every other tenant FK.
ALTER TABLE inventory_transactions      ADD COLUMN item_variant_id uuid;
ALTER TABLE inventory_balances          ADD COLUMN item_variant_id uuid;
ALTER TABLE item_lots                   ADD COLUMN item_variant_id uuid;
ALTER TABLE production_material_moves   ADD COLUMN item_variant_id uuid;

ALTER TABLE inventory_transactions
  ADD CONSTRAINT fk_inv_txn_item_variant
  FOREIGN KEY (company_id, item_variant_id) REFERENCES item_variants (company_id, id);

ALTER TABLE inventory_balances
  ADD CONSTRAINT fk_inv_bal_item_variant
  FOREIGN KEY (company_id, item_variant_id) REFERENCES item_variants (company_id, id);

ALTER TABLE item_lots
  ADD CONSTRAINT fk_item_lots_item_variant
  FOREIGN KEY (company_id, item_variant_id) REFERENCES item_variants (company_id, id);

ALTER TABLE production_material_moves
  ADD CONSTRAINT fk_pmm_item_variant
  FOREIGN KEY (company_id, item_variant_id) REFERENCES item_variants (company_id, id);


-- ── 2) sync_item_variant_id() — BEFORE INSERT auto-fill ─────────────────────
-- If the caller sets `item_variant_id`, we honour it. Otherwise (i.e. every
-- existing code path today) we mirror `component_brand_variant_id` into it.
-- Same shape used for every source table.
CREATE OR REPLACE FUNCTION sync_item_variant_id() RETURNS trigger AS $$
BEGIN
  IF NEW.item_variant_id IS NULL AND NEW.component_brand_variant_id IS NOT NULL THEN
    NEW.item_variant_id := NEW.component_brand_variant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inv_txn_sync_item_variant
  BEFORE INSERT ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION sync_item_variant_id();

CREATE TRIGGER trg_item_lots_sync_item_variant
  BEFORE INSERT ON item_lots
  FOR EACH ROW EXECUTE FUNCTION sync_item_variant_id();

CREATE TRIGGER trg_pmm_sync_item_variant
  BEFORE INSERT ON production_material_moves
  FOR EACH ROW EXECUTE FUNCTION sync_item_variant_id();

-- inventory_balances is NOT tagged — it is filled by the apply_inventory_txn
-- projection trigger, which we update explicitly below.


-- ── 3) Backfill existing rows ───────────────────────────────────────────────
-- Every existing row has component_brand_variant_id set (NOT NULL). item_variants
-- has the same id per F2's identity reuse, so this is a straight column copy.
UPDATE inventory_transactions      SET item_variant_id = component_brand_variant_id WHERE item_variant_id IS NULL;
UPDATE inventory_balances          SET item_variant_id = component_brand_variant_id WHERE item_variant_id IS NULL;
UPDATE item_lots                   SET item_variant_id = component_brand_variant_id WHERE item_variant_id IS NULL;
UPDATE production_material_moves   SET item_variant_id = component_brand_variant_id WHERE item_variant_id IS NULL;


-- ── 4) Update apply_inventory_txn to project item_variant_id ────────────────
-- Same behaviour as before, plus it now writes item_variant_id into balances.
-- The ON CONFLICT target stays on (component_brand_variant_id, location_id)
-- because that unique constraint is what the existing balance rows are keyed
-- by; switching the conflict key to item_variant_id happens in a later feature
-- once `component_brand_variant_id` is nullable (for manufactured items).
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
  ON CONFLICT (component_brand_variant_id, location_id)
  DO UPDATE SET
    on_hand         = inventory_balances.on_hand + EXCLUDED.on_hand,
    -- Defensive COALESCE: any pre-F3 balance row that somehow slipped through
    -- with a null item_variant_id gets filled in on next hit.
    item_variant_id = COALESCE(inventory_balances.item_variant_id, EXCLUDED.item_variant_id),
    updated_at      = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ── 5) NOT NULL on item_variant_id (post-backfill) ──────────────────────────
-- The backfill above filled every existing row; the BEFORE INSERT trigger
-- (installed BEFORE the constraint) guarantees future rows land with a value.
ALTER TABLE inventory_transactions    ALTER COLUMN item_variant_id SET NOT NULL;
ALTER TABLE inventory_balances        ALTER COLUMN item_variant_id SET NOT NULL;
ALTER TABLE item_lots                 ALTER COLUMN item_variant_id SET NOT NULL;
ALTER TABLE production_material_moves ALTER COLUMN item_variant_id SET NOT NULL;


-- ── 6) Balances: mirror the existing unique key on item_variant_id ──────────
-- inventory_balances already has UNIQUE (component_brand_variant_id, location_id).
-- Since item_variant_id == component_brand_variant_id for every current row,
-- adding UNIQUE on (item_variant_id, location_id) is safe. This lets later
-- features flip the projection trigger's ON CONFLICT target atomically.
CREATE UNIQUE INDEX uq_inventory_balances_item_variant_location
  ON inventory_balances (item_variant_id, location_id);


-- ── 7) Lookup indexes on the new columns ────────────────────────────────────
CREATE INDEX ix_inv_txn_item_variant   ON inventory_transactions   (company_id, item_variant_id);
CREATE INDEX ix_inv_bal_item_variant   ON inventory_balances       (company_id, item_variant_id);
CREATE INDEX ix_item_lots_item_variant ON item_lots                (company_id, item_variant_id);
CREATE INDEX ix_pmm_item_variant       ON production_material_moves(company_id, item_variant_id);

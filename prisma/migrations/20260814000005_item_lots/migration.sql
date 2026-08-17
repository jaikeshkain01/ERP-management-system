-- ============================================================================
--  ITEM LOTS (batch tracking) — step 1: additive schema + LOT-LEGACY backfill
-- ============================================================================
-- Introduces per-batch tracking. This migration is intentionally ADDITIVE and
-- behaviour-preserving: it adds the item_lots table + nullable lot_id columns on
-- the ledger/balances and backfills existing stock to a 'LOT-LEGACY' lot. The
-- trigger, the balances unique key, and the NOT NULL constraint are changed in a
-- LATER migration once the app sets lot_id on every movement — so nothing breaks
-- in the meantime.
--
-- Apply with:  npx prisma migrate deploy

-- 1) item_lots — a batch of a specific manufacturer variant.
CREATE TABLE item_lots (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 uuid NOT NULL REFERENCES companies(id),
  component_brand_variant_id uuid NOT NULL,
  lot_no                     text NOT NULL,           -- supplier lot / date code / auto 'LOT-…'
  supplier_id                uuid REFERENCES suppliers(id),
  received_date              date,
  mfg_date                   date,
  expiry_date                date,                    -- drives FEFO
  unit_cost                  numeric(14,4),           -- real cost for valuation
  date_code                  text,
  msl                        text,                    -- moisture sensitivity level
  note                       text,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, component_brand_variant_id) REFERENCES component_brand_variants (company_id, id)
);
CREATE UNIQUE INDEX uq_item_lots_no ON item_lots (company_id, component_brand_variant_id, lot_no) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_item_lots_updated BEFORE UPDATE ON item_lots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_item_lots_audit AFTER INSERT OR UPDATE OR DELETE ON item_lots
  FOR EACH ROW EXECUTE FUNCTION log_field_changes();

ALTER TABLE item_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_lots FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON item_lots
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE INDEX ix_item_lots_company ON item_lots (company_id);

-- 2) lot_id on the ledger + balances (nullable for now).
ALTER TABLE inventory_transactions ADD COLUMN lot_id uuid;
ALTER TABLE inventory_transactions
  ADD CONSTRAINT fk_inv_txn_lot FOREIGN KEY (company_id, lot_id) REFERENCES item_lots (company_id, id);
CREATE INDEX ix_inv_txn_lot ON inventory_transactions (company_id, lot_id);

ALTER TABLE inventory_balances ADD COLUMN lot_id uuid;
ALTER TABLE inventory_balances
  ADD CONSTRAINT fk_inv_bal_lot FOREIGN KEY (company_id, lot_id) REFERENCES item_lots (company_id, id);
CREATE INDEX ix_inv_bal_lot ON inventory_balances (company_id, lot_id);

-- 3) Backfill: one 'LOT-LEGACY' lot per variant that has stock/history, then
--    point existing balances + transactions at it.
INSERT INTO item_lots (company_id, component_brand_variant_id, lot_no)
SELECT DISTINCT x.company_id, x.component_brand_variant_id, 'LOT-LEGACY'
FROM (
  SELECT company_id, component_brand_variant_id FROM inventory_balances WHERE deleted_at IS NULL
  UNION
  SELECT company_id, component_brand_variant_id FROM inventory_transactions
) x
WHERE NOT EXISTS (
  SELECT 1 FROM item_lots il
  WHERE il.company_id = x.company_id AND il.component_brand_variant_id = x.component_brand_variant_id
    AND il.lot_no = 'LOT-LEGACY' AND il.deleted_at IS NULL
);

UPDATE inventory_balances b SET lot_id = il.id
FROM item_lots il
WHERE il.company_id = b.company_id AND il.component_brand_variant_id = b.component_brand_variant_id
  AND il.lot_no = 'LOT-LEGACY' AND il.deleted_at IS NULL AND b.lot_id IS NULL;

UPDATE inventory_transactions t SET lot_id = il.id
FROM item_lots il
WHERE il.company_id = t.company_id AND il.component_brand_variant_id = t.component_brand_variant_id
  AND il.lot_no = 'LOT-LEGACY' AND il.deleted_at IS NULL AND t.lot_id IS NULL;

-- ============================================================================
--  ITEM LOTS — step 2: lot required on every ledger row (auto-assigned)
-- ============================================================================
-- Design: the LEDGER (inventory_transactions.lot_id) is the source of lot truth
-- — every movement is tagged with a lot. inventory_balances stays an AGGREGATE
-- (variant, location) projection of on_hand/reserved (untouched here), so the
-- reserved/allocation trigger and the existing projection keep working exactly
-- as before. Per-lot on-hand is derived from the ledger when needed (FEFO,
-- valuation) — added in the app layer next.
--
-- A BEFORE INSERT trigger auto-assigns a 'LOT-UNASSIGNED' lot whenever the app
-- doesn't supply one, so lot_id can be NOT NULL without breaking any existing
-- insert path (opening stock, PO receive, consumption, transfers, adjustments).
--
-- Apply with:  npx prisma migrate deploy

CREATE OR REPLACE FUNCTION assign_default_lot() RETURNS trigger AS $$
DECLARE v_lot uuid;
BEGIN
  IF NEW.lot_id IS NULL THEN
    SELECT id INTO v_lot FROM item_lots
      WHERE company_id = NEW.company_id
        AND component_brand_variant_id = NEW.component_brand_variant_id
        AND lot_no = 'LOT-UNASSIGNED' AND deleted_at IS NULL
      LIMIT 1;
    IF v_lot IS NULL THEN
      INSERT INTO item_lots (company_id, component_brand_variant_id, lot_no, created_by)
      VALUES (NEW.company_id, NEW.component_brand_variant_id, 'LOT-UNASSIGNED', NEW.created_by)
      RETURNING id INTO v_lot;
    END IF;
    NEW.lot_id := v_lot;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_default_lot
  BEFORE INSERT ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION assign_default_lot();

-- Lot is now mandatory on every ledger row (existing rows were backfilled in step 1).
ALTER TABLE inventory_transactions ALTER COLUMN lot_id SET NOT NULL;

-- Balances remain an aggregate (variant, location) projection — drop the interim
-- per-lot column added in step 1 (lot detail lives on the ledger, derived).
ALTER TABLE inventory_balances DROP CONSTRAINT IF EXISTS fk_inv_bal_lot;
DROP INDEX IF EXISTS ix_inv_bal_lot;
ALTER TABLE inventory_balances DROP COLUMN IF EXISTS lot_id;

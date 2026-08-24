-- ============================================================================
--  F5.4 follow-up — `assign_default_lot` keys on item_variant_id
-- ============================================================================
-- Fixes a lurking regression exposed by F5.4. The trigger installed in
-- `20260814000006_lot_required` created 'LOT-UNASSIGNED' rows keyed by CBV
-- and passed only CBV to the resulting `item_lots` row. Post-F5.4, when a
-- ledger row for a manufactured item lands with CBV=NULL, that INSERT into
-- item_lots hits its NOT NULL on `item_variant_id` and dies.
--
-- The fix keeps the same "auto-attach LOT-UNASSIGNED when the caller doesn't
-- supply one" contract but keys on IV. Trigger firing order on
-- inventory_transactions BEFORE INSERT is alphabetical by trigger name:
--
--     trg_assign_default_lot      (this one — fires FIRST)
--     trg_inv_txn_sync_item_variant  (sync — fires second)
--
-- so at this point NEW.item_variant_id may still be null (if the caller
-- provided only CBV). We derive the effective IV inline via COALESCE, which
-- always gives the right uuid because F2's identity reuse means CBV==IV for
-- every purchased variant that has both.
--
-- Apply with:  npx prisma migrate deploy

CREATE OR REPLACE FUNCTION assign_default_lot() RETURNS trigger AS $$
DECLARE
  v_lot uuid;
  v_iv  uuid;
BEGIN
  IF NEW.lot_id IS NULL THEN
    -- Effective item_variant_id for the lookup / insert. Sync trigger has not
    -- fired yet at this stage, so we derive it ourselves.
    v_iv := COALESCE(NEW.item_variant_id, NEW.component_brand_variant_id);

    SELECT id INTO v_lot FROM item_lots
      WHERE company_id      = NEW.company_id
        AND item_variant_id = v_iv
        AND lot_no          = 'LOT-UNASSIGNED'
        AND deleted_at IS NULL
      LIMIT 1;

    IF v_lot IS NULL THEN
      INSERT INTO item_lots (
        company_id, component_brand_variant_id, item_variant_id, lot_no, created_by
      ) VALUES (
        NEW.company_id, NEW.component_brand_variant_id, v_iv, 'LOT-UNASSIGNED', NEW.created_by
      )
      RETURNING id INTO v_lot;
    END IF;

    NEW.lot_id := v_lot;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

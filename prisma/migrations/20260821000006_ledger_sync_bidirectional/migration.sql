-- ============================================================================
--  F5.3 — Ledger sync trigger becomes BIDIRECTIONAL
-- ============================================================================
-- F3 installed `sync_item_variant_id()` as a one-way trigger:
--
--     item_variant_id := component_brand_variant_id  (when null)
--
-- so that every existing INSERT path (which set only `component_brand_variant_id`)
-- kept working. That was the safe first step.
--
-- F5.3 flips the missing half on: when a caller sets only `item_variant_id`,
-- the trigger now fills `component_brand_variant_id` from it — but only when
-- a matching purchased CBV exists (F2 reused CBV.id as item_variants.id, so
-- the lookup is by id). Manufactured variants have no CBV: for those, the
-- trigger leaves CBV NULL. That row would fail the current NOT NULL until
-- F5.4 lifts it — F5.3 alone unlocks purchased-item writes via the new
-- column, and F5.4 finishes the job for manufactured items.
--
-- Non-breaking:
--   • The forward direction is preserved verbatim — every existing INSERT
--     path continues to populate both columns.
--   • Adding the reverse branch only affects rows where CBV is NULL, which
--     were previously rejected outright by the NOT NULL constraint.
--   • The trigger is attached to inventory_transactions, item_lots, and
--     production_material_moves — same three source tables as F3.
--
-- Apply with:  npx prisma migrate deploy

CREATE OR REPLACE FUNCTION sync_item_variant_id() RETURNS trigger AS $$
BEGIN
  -- Forward (F3): fill item_variant_id from CBV when the caller left it blank.
  IF NEW.item_variant_id IS NULL AND NEW.component_brand_variant_id IS NOT NULL THEN
    NEW.item_variant_id := NEW.component_brand_variant_id;
  END IF;

  -- Reverse (F5.3): fill CBV from item_variant_id when the caller left CBV
  -- blank. Requires a matching CBV row (purchased variants only — the F2
  -- backfill reused CBV.id as item_variants.id, so an id-equality lookup
  -- correctly finds it). Manufactured variants have no CBV; for those, the
  -- column stays NULL and F5.4's DROP NOT NULL is required before the row
  -- can be inserted.
  IF NEW.component_brand_variant_id IS NULL AND NEW.item_variant_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM component_brand_variants WHERE id = NEW.item_variant_id) THEN
      NEW.component_brand_variant_id := NEW.item_variant_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

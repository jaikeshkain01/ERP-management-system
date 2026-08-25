-- ============================================================================
--  Slice 3 — items.is_finished_good (sellable flag)
-- ============================================================================
-- A flag that says "we sell this thing". Deliberately INDEPENDENT of stage:
--   • A Populated PCB can be `semi_assembled` and still be a finished good
--     (some customers buy boards, not full products).
--   • An `assembled` item that is only ever internal (e.g. an in-house test
--     rig) is NOT a finished good.
--
-- Feeds a future sales / quote / order module. Nothing consumes it yet, so
-- this migration is purely additive.
--
-- BACKFILL:
--   Legacy `products` rows WERE, by definition, the finished-goods master —
--   they existed to be sold. Every product-backed item (F2 backfill mirrored
--   `products.id` → `items.id`) starts with the flag set. Every other item
--   defaults to false; users flip it individually in the add/edit form.
--
-- Apply with:  npx prisma migrate deploy


ALTER TABLE items
  ADD COLUMN is_finished_good boolean NOT NULL DEFAULT false;

-- Backfill: product-backed items are finished goods.
UPDATE items i
   SET is_finished_good = true
  FROM products p
 WHERE p.id = i.id;

-- Partial index for the "list all sellable items" query the sales module
-- will need. Tiny in practice — finished goods are a small subset.
CREATE INDEX ix_items_is_finished_good
  ON items (company_id)
  WHERE deleted_at IS NULL AND is_finished_good = true;

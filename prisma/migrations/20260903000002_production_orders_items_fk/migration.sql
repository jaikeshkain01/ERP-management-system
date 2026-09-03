-- Repoint production_orders + production_order_items FKs at the universal
-- items table. F2 mirrored the legacy products.id and components.id
-- id-spaces onto items.id, so any historical value already resolves in
-- items; the change is a straight FK swap with no data migration.
--
-- Rationale: /api/production/orders and createProductionOrder now resolve
-- the parent from `items` (item_type='assembled') and pull leaves from
-- `item_bom_lines`. Leaving the FKs pointed at products/components blocked
-- the rewrite because leaf items created via /api/items don't have a
-- components mirror row.
--
-- Existing rows in this DB: 0 production_orders, 0 production_order_items,
-- so an unconditional swap is safe. If a tenant carried live orders when
-- the migration runs, every historical id must already appear in items
-- (F2 invariant) — a compile-time failure here would flag the exception.

ALTER TABLE production_orders
  DROP CONSTRAINT IF EXISTS production_orders_company_id_product_id_fkey;
ALTER TABLE production_orders
  ADD CONSTRAINT production_orders_company_id_product_id_fkey
  FOREIGN KEY (company_id, product_id)
  REFERENCES items(company_id, id)
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE production_order_items
  DROP CONSTRAINT IF EXISTS production_order_items_company_id_component_id_fkey;
ALTER TABLE production_order_items
  ADD CONSTRAINT production_order_items_company_id_component_id_fkey
  FOREIGN KEY (company_id, component_id)
  REFERENCES items(company_id, id)
  ON DELETE NO ACTION ON UPDATE NO ACTION;

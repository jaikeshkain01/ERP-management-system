-- ============================================================================
--  items.default_supplier_id — preferred supplier on an item (Slice A of the
--  BOM importer)
-- ============================================================================
-- Adds a nullable, tenant-scoped FK from `items` to `suppliers`. This is the
-- "preferred supplier" hint the BOM importer needs so a Supplier column from
-- an incoming spreadsheet has a home on the item master.
--
-- Design notes:
--   • Nullable. A native (non-imported) item may never pick a supplier — the
--     column stays NULL and everything downstream still works.
--   • Purely advisory. It does NOT constrain which suppliers can appear on
--     purchase orders for this item — PO-level supplier tracking is unchanged.
--     Analogous to bom_lines.preferred_brand_id: a hint, not a lock.
--   • Composite FK (company_id, default_supplier_id) → suppliers (company_id, id)
--     matches the pattern used for items.category_id (see 20260819000000).
--
-- Behaviour if the referenced supplier is later soft-deleted: the FK still
-- points at the row (composite FK doesn't cascade), the join filters on
-- suppliers.deleted_at IS NULL and the app treats it as "no preferred
-- supplier". No trigger needed.
--
-- Apply with:  npx prisma migrate deploy

ALTER TABLE items
  ADD COLUMN default_supplier_id uuid;

ALTER TABLE items
  ADD CONSTRAINT fk_items_default_supplier
  FOREIGN KEY (company_id, default_supplier_id)
  REFERENCES suppliers (company_id, id);

CREATE INDEX ix_items_default_supplier
  ON items (company_id, default_supplier_id)
  WHERE default_supplier_id IS NOT NULL;

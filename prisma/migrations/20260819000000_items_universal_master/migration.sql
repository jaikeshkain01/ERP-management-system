-- ============================================================================
--  F1 — UNIVERSAL ITEM MASTER (additive, no cutover)
-- ============================================================================
-- Introduces the `items` table + `item_variants`. This is the FOUNDATION of the
-- transformation described in project_universal_item: every "thing" the company
-- holds (raw materials, sub-assemblies, finished goods, consumables, assets,
-- packaging) becomes a row in one table, differentiated by item_type.
--
-- SCOPE OF THIS MIGRATION (deliberately narrow):
--   • Create the tables + supporting enums, RLS, audit, updated_at triggers.
--   • NOTHING is repointed at these tables yet. `components`, `products`,
--     `pcbs`, `bom_versions`, and the ledger keep pointing at the old shapes.
--   • These tables are EMPTY when this migration runs. Backfill from the legacy
--     tables happens in F2 (next migration). Ledger/BOM repoint happens in F3+.
--
-- ID STRATEGY:
--   `items.id` will REUSE existing `components.id` / `products.id` /
--   `pcb_revisions.id` when F2's backfill runs — so downstream FK repointing
--   in F3+ is a column swap, not an id rewrite.
--
-- CODE UNIQUENESS:
--   `items.code` is unique per tenant ACROSS ALL item_types. If the legacy
--   `components.generic_pn`, `products.code`, and `pcbs.slug` collide at F2
--   backfill time, F2 will disambiguate by prefixing with the item_type. This
--   migration enforces the constraint from day one so nothing dirty gets in.
--
-- Apply with:  npx prisma migrate deploy

-- 1) Enums --------------------------------------------------------------------
-- `item_type` already exists (from 20260813000000_item_categories_and_types).
-- We introduce two new lightweight enums that belong on the item, not on the
-- category (categories can only set a DEFAULT item_type; per-item behavior is
-- richer).

CREATE TYPE item_status AS ENUM ('active', 'inactive', 'discontinued');

-- How a variant of an item is sourced. 'purchased' = bought from a brand;
-- 'manufactured' = produced in-house. A single item can have both — e.g. we
-- buy a PCB from a vendor AND manufacture the same PCB ourselves — but the
-- manufactured variant is always singular per item (no "brand" for it).
CREATE TYPE item_variant_source AS ENUM ('purchased', 'manufactured');


-- 2) items --------------------------------------------------------------------
-- The universal identity + master-data record. Everything downstream (variants,
-- BOMs, stock, purchase, production, sales) will resolve to a row here in later
-- features. Kept intentionally lean in F1: only fields that every item type
-- needs. Behaviour flags (custodian_required, is_depreciable, calibration_*,
-- warranty_months, licensing, hazardous, ownership) come in F14 as additive
-- columns — they are meaningless until Phase D introduces the classes that use
-- them, so we do not carry the dead weight now.
CREATE TABLE items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id),

  code          text NOT NULL,             -- tenant-global identifier (across ALL item_types)
  name          text NOT NULL,
  description   text,

  category_id   uuid,                      -- FK item_categories (nullable at F1; category becomes required post-F2 once every legacy row is placed)
  item_type     item_type NOT NULL DEFAULT 'raw',
  base_uom      text NOT NULL DEFAULT 'PCS',

  -- Stocking hints. These live on the item because they are the same across
  -- variants (min_stock is "how many resistors do I want on hand", not
  -- per-brand). Reorder logic in F14+ can use them.
  min_stock         numeric(14,3) NOT NULL DEFAULT 0,
  reorder_qty       numeric(14,3) NOT NULL DEFAULT 0,
  safety_stock      numeric(14,3) NOT NULL DEFAULT 0,
  lead_time_days    integer,

  -- Free-form spec bag: retained for parity with components.specs so backfill
  -- is lossless. Individual item classes may treat this differently later.
  specs         jsonb NOT NULL DEFAULT '[]'::jsonb,

  status        item_status NOT NULL DEFAULT 'active',

  created_by    uuid REFERENCES users(id),
  updated_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,

  UNIQUE (company_id, id),                                       -- composite target for future FKs
  FOREIGN KEY (company_id, category_id) REFERENCES item_categories (company_id, id)
);

-- Global (per-tenant) code uniqueness across all item_types. Partial so
-- soft-deleted rows do not block reuse.
CREATE UNIQUE INDEX uq_items_code ON items (company_id, code) WHERE deleted_at IS NULL;
CREATE INDEX ix_items_company    ON items (company_id);
CREATE INDEX ix_items_category   ON items (company_id, category_id);
CREATE INDEX ix_items_type       ON items (company_id, item_type);
CREATE INDEX ix_items_status     ON items (company_id, status) WHERE deleted_at IS NULL;
-- NOTE: no trigram index on name here — the pg_trgm extension is not installed
-- in this project. ILIKE '%q%' scans the table, which is fine while `items` is
-- small. When the master crosses ~50k rows, add pg_trgm + a GIN index on
-- lower(name) as a follow-up.


-- 3) item_variants ------------------------------------------------------------
-- A physical instantiation of an item. For a purchased item, a variant = one
-- (brand + manufacturer part_no) pair. For a manufactured item, there is
-- exactly ONE variant (no brand — we made it). The ledger keys movements on
-- `item_variant_id` in F3, so the variant is the atom of stock.
--
-- Notes:
--   • `brand_id` is required for source_kind='purchased' and MUST be NULL for
--     source_kind='manufactured'. Enforced via a CHECK below.
--   • Uniqueness: one manufactured variant per item; and one purchased variant
--     per (item, brand). Both enforced by partial unique indexes.
--   • Exactly one variant per item is marked `is_default=true` (used by the UI
--     and legacy-adapter code when the caller does not name a variant).
CREATE TABLE item_variants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id),
  item_id       uuid NOT NULL,

  source_kind   item_variant_source NOT NULL DEFAULT 'purchased',
  brand_id      uuid,                      -- required for 'purchased', NULL for 'manufactured'
  part_no       text,                      -- manufacturer P/N for 'purchased'; typically NULL for 'manufactured'

  is_default    boolean NOT NULL DEFAULT false,
  status        item_status NOT NULL DEFAULT 'active',

  created_by    uuid REFERENCES users(id),
  updated_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,

  UNIQUE (company_id, id),                                       -- composite target for future FKs
  FOREIGN KEY (company_id, item_id)  REFERENCES items  (company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, brand_id) REFERENCES brands (company_id, id) ON DELETE RESTRICT,

  CONSTRAINT ck_iv_brand_matches_source CHECK (
    (source_kind = 'purchased'    AND brand_id IS NOT NULL) OR
    (source_kind = 'manufactured' AND brand_id IS NULL)
  )
);

-- One manufactured variant per item (partial unique on source_kind).
CREATE UNIQUE INDEX uq_item_variants_manufactured
  ON item_variants (company_id, item_id)
  WHERE source_kind = 'manufactured' AND deleted_at IS NULL;

-- One purchased variant per (item, brand).
CREATE UNIQUE INDEX uq_item_variants_purchased_brand
  ON item_variants (company_id, item_id, brand_id)
  WHERE source_kind = 'purchased' AND deleted_at IS NULL;

-- Exactly one default variant per item.
CREATE UNIQUE INDEX uq_item_variants_default
  ON item_variants (company_id, item_id)
  WHERE is_default AND deleted_at IS NULL;

CREATE INDEX ix_item_variants_company ON item_variants (company_id);
CREATE INDEX ix_item_variants_item    ON item_variants (company_id, item_id);
CREATE INDEX ix_item_variants_brand   ON item_variants (company_id, brand_id);


-- 4) Triggers -----------------------------------------------------------------
-- The auto-updated_at DO $$ block in 0_init only attached to tables that
-- existed at that time. New tables must register the trigger themselves.
CREATE TRIGGER trg_items_updated
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_item_variants_updated
  BEFORE UPDATE ON item_variants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Field-level audit log (schema-wide helper defined in 0_init).
CREATE TRIGGER trg_items_audit
  AFTER INSERT OR UPDATE OR DELETE ON items
  FOR EACH ROW EXECUTE FUNCTION log_field_changes();

CREATE TRIGGER trg_item_variants_audit
  AFTER INSERT OR UPDATE OR DELETE ON item_variants
  FOR EACH ROW EXECUTE FUNCTION log_field_changes();


-- 5) Row-Level Security -------------------------------------------------------
-- Same shape as every other tenant table: FORCE RLS + tenant_isolation policy
-- keyed on current_company_id(). App runs as a role that is NOT the table
-- owner and NOT BYPASSRLS, per 0_init §RLS.
ALTER TABLE items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE items          FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON items
  USING       (company_id = current_company_id())
  WITH CHECK  (company_id = current_company_id());

ALTER TABLE item_variants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_variants  FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON item_variants
  USING       (company_id = current_company_id())
  WITH CHECK  (company_id = current_company_id());

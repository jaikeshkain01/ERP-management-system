-- ============================================================================
--  ITEM CATEGORIES (tree) + ITEM TYPE   — Phase 2A of Components → Items
-- ============================================================================
-- Generalises the components master toward an "Item" master that can hold any
-- inventory item (raw parts, sub-assemblies, finished goods, consumables, IT
-- assets, packaging). Introduces:
--
--   * item_type  — the lifecycle STAGE of an item. Existing rows are all raw
--                  electronic parts, so they backfill to 'raw'.
--   * item_categories — a self-referencing category TREE that replaces the flat
--                  components.category text. Multi-tenant + RLS + audit, exactly
--                  like every other tenant table. `path` is a materialised slug
--                  path ('electronic-components/passive/resistors') for fast
--                  descendant filtering.
--   * components.item_type + components.category_id (FK into the tree).
--
-- The legacy components.category text is KEPT for now and back-filled into the
-- tree as top-level nodes (lossless). It is dropped in a later phase once the
-- app reads exclusively from category_id.
--
-- Apply with:  npx prisma migrate deploy   (runs pending migration SQL as-is;
-- does NOT diff schema.prisma, matching how this repo's earlier migrations were
-- applied — newer tables live in raw SQL, not the generated client).

-- 1) item_type enum ----------------------------------------------------------
CREATE TYPE item_type AS ENUM (
  'raw', 'semi_assembled', 'assembled', 'consumable', 'asset', 'packaging'
);

-- 2) item_categories: the tenant-scoped category tree -------------------------
CREATE TABLE item_categories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id),
  parent_id         uuid,                        -- up the tree; NULL at a root
  name              text NOT NULL,               -- 'Resistors'
  slug              text NOT NULL,               -- 'resistors'
  path              text NOT NULL,               -- 'electronic-components/passive/resistors'
  default_item_type item_type,                   -- pre-fills item_type for items added here
  sort_order        integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id),                        -- composite-FK target (self-ref + components)
  FOREIGN KEY (company_id, parent_id) REFERENCES item_categories (company_id, id)
);
-- path is unique per tenant (identifies a node); slug uniqueness among siblings
CREATE UNIQUE INDEX uq_item_categories_path ON item_categories (company_id, path) WHERE deleted_at IS NULL;
CREATE INDEX ix_item_categories_parent ON item_categories (company_id, parent_id);

-- updated_at auto-bump + field-level audit (schema-wide helpers already exist)
CREATE TRIGGER trg_item_categories_updated BEFORE UPDATE ON item_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_item_categories_audit AFTER INSERT OR UPDATE OR DELETE ON item_categories
  FOR EACH ROW EXECUTE FUNCTION log_field_changes();

-- Row-Level Security: tenant isolation (same shape as every other tenant table)
ALTER TABLE item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_categories FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON item_categories
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE INDEX ix_item_categories_company ON item_categories (company_id);

-- 3) components: item_type + category_id --------------------------------------
ALTER TABLE components ADD COLUMN item_type item_type NOT NULL DEFAULT 'raw';
ALTER TABLE components ADD COLUMN category_id uuid;
ALTER TABLE components
  ADD CONSTRAINT fk_components_category
  FOREIGN KEY (company_id, category_id) REFERENCES item_categories (company_id, id);
CREATE INDEX ix_components_category ON components (company_id, category_id);

-- 4) Backfill: each distinct existing category string → a top-level node, then
--    link components to it. Lossless; the hierarchy is built out later in the UI.
INSERT INTO item_categories (company_id, parent_id, name, slug, path, default_item_type)
SELECT DISTINCT ON (company_id, slug)
       company_id, NULL, name, slug, slug, 'raw'::item_type
FROM (
  SELECT company_id,
         trim(category)                                                    AS name,
         btrim(regexp_replace(lower(category), '[^a-z0-9]+', '-', 'g'), '-') AS slug
  FROM components
  WHERE category IS NOT NULL AND btrim(category) <> '' AND deleted_at IS NULL
) s
ORDER BY company_id, slug, name;

UPDATE components c
SET category_id = ic.id
FROM item_categories ic
WHERE ic.company_id = c.company_id
  AND ic.path = btrim(regexp_replace(lower(c.category), '[^a-z0-9]+', '-', 'g'), '-')
  AND c.category IS NOT NULL AND btrim(c.category) <> '';

-- ============================================================================
--  CUSTOM (USER-ADDED) PRODUCTS
-- ============================================================================
-- Products a user adds via "Import BOM" or "Add Manually". Their BOM lines are
-- arbitrary free-text part numbers (raw MPN / manufacturer / qty), NOT registered
-- catalog components, so they CANNOT be expressed through the
-- products -> bom_versions -> product_pcbs -> pcb_lines -> components graph.
-- They live in their own tables with the raw lines stored as JSONB. Multi-tenant
-- + RLS + audit, following the same conventions as the rest of the schema.
--
-- A custom_product holds MANY bom versions (v1, Rev B, …); active_version_id
-- points at the one currently shown in the Product Structure view.

CREATE TABLE custom_products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id),
  slug              text NOT NULL,
  name              text NOT NULL,
  code              text,
  description       text,
  source            text NOT NULL,          -- 'import' | 'manual'
  active_version_id uuid,                    -- FK added below (breaks the create cycle)
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX uq_custom_products_slug ON custom_products (company_id, slug) WHERE deleted_at IS NULL;

CREATE TABLE custom_bom_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id),
  custom_product_id uuid NOT NULL,
  label             text NOT NULL,
  source            text NOT NULL,          -- 'import' | 'manual'
  file_name         text,
  note              text,
  lines             jsonb NOT NULL DEFAULT '[]',
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, custom_product_id) REFERENCES custom_products (company_id, id)
);
CREATE INDEX ix_custom_bom_versions_product ON custom_bom_versions (company_id, custom_product_id);

-- active_version_id -> custom_bom_versions (added after the table exists; the
-- app inserts the product, then the version, then sets this in one transaction).
ALTER TABLE custom_products
  ADD CONSTRAINT fk_custom_products_active_version
  FOREIGN KEY (company_id, active_version_id) REFERENCES custom_bom_versions (company_id, id);

-- updated_at auto-bump (the schema-wide trigger loop already ran; attach explicitly).
CREATE TRIGGER trg_custom_products_updated BEFORE UPDATE ON custom_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_custom_bom_versions_updated BEFORE UPDATE ON custom_bom_versions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Field-level audit log.
CREATE TRIGGER trg_custom_products_audit AFTER INSERT OR UPDATE OR DELETE ON custom_products
  FOR EACH ROW EXECUTE FUNCTION log_field_changes();
CREATE TRIGGER trg_custom_bom_versions_audit AFTER INSERT OR UPDATE OR DELETE ON custom_bom_versions
  FOR EACH ROW EXECUTE FUNCTION log_field_changes();

-- Row-Level Security: tenant isolation (same shape as every other tenant table).
ALTER TABLE custom_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_products FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON custom_products
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE INDEX ix_custom_products_company ON custom_products (company_id);

ALTER TABLE custom_bom_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_bom_versions FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON custom_bom_versions
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE INDEX ix_custom_bom_versions_company ON custom_bom_versions (company_id);

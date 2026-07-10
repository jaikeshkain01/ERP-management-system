-- ============================================================================
--  MODULE LICENSING  +  SUPPLIER LINKS
-- ============================================================================
-- 1) company_modules — per-tenant enabled/disabled state for the paid modules
--    (registry lives in code: src/lib/modules.ts). Replaces the localStorage
--    toggle so licensing persists per company. Absent row ⇒ enabled (default on).
CREATE TABLE company_modules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
  module_id   text NOT NULL,                 -- inventory | bom | purchasing | production | reports
  enabled     boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX uq_company_modules ON company_modules (company_id, module_id) WHERE deleted_at IS NULL;

-- 2) brand_suppliers — authorised suppliers for a brand (the "Map Supplier"
--    brand-level list). Distinct from component-level supplier prices; a
--    convenience/authorisation link with optional indicative terms.
CREATE TABLE brand_suppliers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id),
  brand_id       uuid NOT NULL REFERENCES brands(id),
  supplier_id    uuid NOT NULL REFERENCES suppliers(id),
  est_price      numeric(14,4),
  moq            integer,
  lead_time_days integer,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX uq_brand_suppliers ON brand_suppliers (company_id, brand_id, supplier_id) WHERE deleted_at IS NULL;

-- 3) components.preferred_supplier_id — the user-chosen preferred supplier for a
--    component ("Set Preferred"). NULL ⇒ derive default (cheapest current price).
ALTER TABLE components ADD COLUMN preferred_supplier_id uuid REFERENCES suppliers(id);

-- updated_at + audit triggers (schema-wide loops already ran; attach explicitly).
CREATE TRIGGER trg_company_modules_updated BEFORE UPDATE ON company_modules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_brand_suppliers_updated BEFORE UPDATE ON brand_suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_company_modules_audit AFTER INSERT OR UPDATE OR DELETE ON company_modules
  FOR EACH ROW EXECUTE FUNCTION log_field_changes();
CREATE TRIGGER trg_brand_suppliers_audit AFTER INSERT OR UPDATE OR DELETE ON brand_suppliers
  FOR EACH ROW EXECUTE FUNCTION log_field_changes();

-- Row-Level Security: tenant isolation.
ALTER TABLE company_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_modules FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON company_modules
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE INDEX ix_company_modules_company ON company_modules (company_id);

ALTER TABLE brand_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_suppliers FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON brand_suppliers
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE INDEX ix_brand_suppliers_company ON brand_suppliers (company_id);

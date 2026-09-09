-- ============================================================================
--  Item Stages + Item Serials (per-piece tracking foundation)
-- ============================================================================
-- Adds workflow stages to items and a serial-number table for per-piece
-- stage tracking. Also hard-locks source_kind by item_type:
--   raw / consumable / asset / packaging → always purchased
--   sub_assembly / finished_product     → always manufactured
--
-- Stage flow:
--   Purchased items:    untested → testing → tested | faulty (→ testing rework)
--   Manufactured items: under_production → production_complete →
--                       untested → testing → tested | faulty → finished

-- 1) item_stage enum --------------------------------------------------------
CREATE TYPE item_stage AS ENUM (
  'under_production',
  'production_complete',
  'untested',
  'testing',
  'tested',
  'faulty',
  'finished'
);

-- 2) Add default_stage to items ---------------------------------------------
-- Represents the starting stage for new pieces of this item.
-- Purchased items default to 'untested'; manufactured to 'under_production'.
ALTER TABLE items
  ADD COLUMN default_stage item_stage;

-- Backfill existing rows based on item_type.
UPDATE items SET default_stage = 'untested'
  WHERE item_type IN ('raw', 'consumable', 'asset', 'packaging');
UPDATE items SET default_stage = 'under_production'
  WHERE item_type IN ('sub_assembly', 'finished_product');

-- Now make it NOT NULL.
ALTER TABLE items
  ALTER COLUMN default_stage SET NOT NULL;

-- 3) item_serials table -----------------------------------------------------
-- Per-piece tracking. Each physical unit gets a row with its own serial
-- number and current stage. serial_no is auto-increment per item (not
-- globally unique — the pair (item_id, serial_no) is unique).
CREATE TABLE item_serials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id),
  item_id       uuid NOT NULL,
  serial_no     integer NOT NULL,
  stage         item_stage NOT NULL,
  notes         text,

  created_by    uuid REFERENCES users(id),
  updated_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,

  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, item_id) REFERENCES items (company_id, id) ON DELETE RESTRICT
);

-- Serial number uniqueness per item (tenant-scoped, soft-delete aware).
CREATE UNIQUE INDEX uq_item_serials_no
  ON item_serials (company_id, item_id, serial_no)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_item_serials_company ON item_serials (company_id);
CREATE INDEX ix_item_serials_item    ON item_serials (company_id, item_id);
CREATE INDEX ix_item_serials_stage   ON item_serials (company_id, stage)
  WHERE deleted_at IS NULL;

-- 4) Triggers ---------------------------------------------------------------
CREATE TRIGGER trg_item_serials_updated
  BEFORE UPDATE ON item_serials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_item_serials_audit
  AFTER INSERT OR UPDATE OR DELETE ON item_serials
  FOR EACH ROW EXECUTE FUNCTION log_field_changes();

-- 5) Row-Level Security -----------------------------------------------------
ALTER TABLE item_serials  ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_serials  FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON item_serials
  USING       (company_id = current_company_id())
  WITH CHECK  (company_id = current_company_id());

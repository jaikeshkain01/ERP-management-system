-- ============================================================================
--  F6.1 — UNIVERSAL BOM MASTER (additive, no cutover)
-- ============================================================================
-- Introduces `item_bom_versions` + `item_bom_lines`: one BOM model for every
-- manufactured item, keyed on `items`. This unifies the two disjoint legacy
-- BOM hierarchies:
--
--   • PCB BOM     : pcb_revisions --(pcb_lines)--> components
--   • Product BOM : products --(bom_versions → product_pcbs)--> pcb_revisions
--
-- Both parents and children are already `items` rows (F2 backfill reused the
-- source uuid as items.id), so a single table keyed on item ids represents
-- both — and supports arbitrary depth (a product BOM line pointing at a
-- sub-assembly item whose own BOM points at raw items).
--
-- SCOPE OF THIS MIGRATION (deliberately narrow, mirrors F1):
--   • Create the two tables + RLS + audit + updated_at triggers.
--   • NOTHING is repointed. pcb_lines / bom_versions / product_pcbs keep
--     serving the legacy PCB + product screens unchanged.
--   • These tables are EMPTY here. Backfill from the legacy tables is F6.2.
--   • App reads/writes wire up in F6.3+.
--
-- NAMING: `item_bom_versions` / `item_bom_lines` (not the plan's bare
-- `bom_versions`/`bom_lines`) because a product-scoped `bom_versions` table
-- already exists from 0_init. The `item_*` prefix matches items / item_variants
-- / item_lots / item_categories and keeps the legacy table free for the
-- dual-write transition.
--
-- Apply with:  npx prisma migrate deploy


-- 1) item_bom_versions --------------------------------------------------------
-- A versioned BOM owned by a PARENT item (a manufactured item — assembled or
-- semi_assembled). `status` reuses the existing bom_status enum
-- (Draft/Active/Superseded/Obsolete). At most one Active version per parent.
--
-- Lineage columns (`legacy_pcb_revision_id`, `legacy_bom_version_id`) trace a
-- backfilled row to its source so F6.2 stays idempotent and later reconciliation
-- can diff universal vs legacy. Both NULL for a natively-created universal BOM.
CREATE TABLE item_bom_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id),

  parent_item_id uuid NOT NULL,
  version        text NOT NULL,            -- 'Rev A' (from pcb) or '1.0' (from product) or user-set
  status         bom_status NOT NULL DEFAULT 'Draft',
  effective_from date,
  effective_to   date,

  -- Backfill lineage (nullable; set by F6.2, NULL for native BOMs).
  legacy_pcb_revision_id uuid,
  legacy_bom_version_id  uuid,

  created_by  uuid REFERENCES users(id),
  updated_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE (company_id, id),                                       -- composite target for FKs
  FOREIGN KEY (company_id, parent_item_id) REFERENCES items (company_id, id) ON DELETE RESTRICT
);

-- One version label per parent (among live rows).
CREATE UNIQUE INDEX uq_item_bom_versions_parent_version
  ON item_bom_versions (company_id, parent_item_id, version)
  WHERE deleted_at IS NULL;

-- At most one Active BOM version per parent item.
CREATE UNIQUE INDEX uq_item_bom_versions_active
  ON item_bom_versions (company_id, parent_item_id)
  WHERE status = 'Active' AND deleted_at IS NULL;

-- Backfill idempotency: a given legacy row maps to exactly one universal version.
CREATE UNIQUE INDEX uq_item_bom_versions_legacy_pcb
  ON item_bom_versions (legacy_pcb_revision_id)
  WHERE legacy_pcb_revision_id IS NOT NULL;
CREATE UNIQUE INDEX uq_item_bom_versions_legacy_product
  ON item_bom_versions (legacy_bom_version_id)
  WHERE legacy_bom_version_id IS NOT NULL;

CREATE INDEX ix_item_bom_versions_parent ON item_bom_versions (company_id, parent_item_id);


-- 2) item_bom_lines -----------------------------------------------------------
-- One line = "this parent BOM needs `qty` of `child_item_id`". The child is any
-- item: a raw component, a sub-assembly, packaging, a consumable. Depth is
-- implicit — resolving a product BOM means walking each child that itself has
-- an item_bom_versions row.
CREATE TABLE item_bom_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id),

  bom_version_id     uuid NOT NULL,
  child_item_id      uuid NOT NULL,
  qty                numeric(14,4) NOT NULL CHECK (qty > 0),
  ref_des            text,                 -- 'R1-R20' for board lines; NULL for product→pcb lines
  preferred_brand_id uuid,                 -- optional brand hint (board lines)
  sequence           integer,              -- assembly order (product→pcb lines)
  remarks            text,

  created_by  uuid REFERENCES users(id),
  updated_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, bom_version_id)     REFERENCES item_bom_versions (company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, child_item_id)      REFERENCES items            (company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, preferred_brand_id) REFERENCES brands           (company_id, id) ON DELETE RESTRICT
);

-- One line per (version, child) — merge quantities rather than duplicate a child.
CREATE UNIQUE INDEX uq_item_bom_lines_version_child
  ON item_bom_lines (bom_version_id, child_item_id)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_item_bom_lines_version ON item_bom_lines (company_id, bom_version_id);
CREATE INDEX ix_item_bom_lines_child   ON item_bom_lines (company_id, child_item_id);


-- 3) Triggers -----------------------------------------------------------------
CREATE TRIGGER trg_item_bom_versions_updated
  BEFORE UPDATE ON item_bom_versions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_item_bom_lines_updated
  BEFORE UPDATE ON item_bom_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_item_bom_versions_audit
  AFTER INSERT OR UPDATE OR DELETE ON item_bom_versions
  FOR EACH ROW EXECUTE FUNCTION log_field_changes();
CREATE TRIGGER trg_item_bom_lines_audit
  AFTER INSERT OR UPDATE OR DELETE ON item_bom_lines
  FOR EACH ROW EXECUTE FUNCTION log_field_changes();


-- 4) Row-Level Security -------------------------------------------------------
ALTER TABLE item_bom_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_bom_versions FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON item_bom_versions
  USING       (company_id = current_company_id())
  WITH CHECK  (company_id = current_company_id());

ALTER TABLE item_bom_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_bom_lines FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON item_bom_lines
  USING       (company_id = current_company_id())
  WITH CHECK  (company_id = current_company_id());

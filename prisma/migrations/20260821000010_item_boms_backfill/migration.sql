-- ============================================================================
--  F6.2 — BACKFILL item_bom_versions + item_bom_lines FROM legacy BOMs
-- ============================================================================
-- Mirrors both legacy BOM hierarchies into the universal tables created by F6.1.
-- Additive + idempotent (lineage-column unique indexes + ON CONFLICT), so a
-- re-run after a partial apply is safe.
--
--   PCB BOM:
--     pcb_revisions  → item_bom_versions (parent = the revision's item)
--     pcb_lines      → item_bom_lines    (child  = the component's item)
--
--   Product BOM:
--     bom_versions   → item_bom_versions (parent = the product's item)
--     product_pcbs   → item_bom_lines    (child  = the pcb_revision's item)
--
-- Every parent/child uuid used below is ALSO an items.id (F2 reused the source
-- uuid), so the FK to items resolves without translation.
--
-- STATUS: legacy bom_status carries straight over (Draft/Active/Superseded/
-- Obsolete) — the enum is shared, and the "at most one Active per parent"
-- invariant already held on the legacy side, so it holds here too.
--
-- Apply with:  npx prisma migrate deploy


-- ── 1) PCB revisions → item_bom_versions ────────────────────────────────────
-- The revision's `rev` string becomes the version label. Soft-deleted revisions
-- are skipped (their item mirror may exist but a deleted BOM should not appear).
INSERT INTO item_bom_versions (
  company_id, parent_item_id, version, status, effective_from, effective_to,
  legacy_pcb_revision_id, created_by, updated_by, created_at, updated_at
)
SELECT
  pr.company_id, pr.id, pr.rev, pr.status, pr.effective_from, pr.effective_to,
  pr.id, pr.created_by, pr.updated_by, pr.created_at, pr.updated_at
FROM pcb_revisions pr
WHERE pr.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM items i WHERE i.id = pr.id)
ON CONFLICT DO NOTHING;


-- ── 2) pcb_lines → item_bom_lines ───────────────────────────────────────────
-- child = the component's item mirror. Merge-key is (bom_version_id, child):
-- a legacy pcb_lines row is unique per (revision, component), so no collision.
INSERT INTO item_bom_lines (
  company_id, bom_version_id, child_item_id, qty, ref_des, preferred_brand_id,
  remarks, created_by, updated_by, created_at, updated_at
)
SELECT
  pl.company_id, bv.id, pl.component_id, pl.qty, pl.ref_des, pl.preferred_brand_id,
  pl.remarks, pl.created_by, pl.updated_by, pl.created_at, pl.updated_at
FROM pcb_lines pl
JOIN item_bom_versions bv ON bv.legacy_pcb_revision_id = pl.pcb_revision_id
WHERE pl.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM items i WHERE i.id = pl.component_id)
ON CONFLICT DO NOTHING;


-- ── 3) Product bom_versions → item_bom_versions ─────────────────────────────
-- parent = the product's item mirror. Version label = the product BOM version.
INSERT INTO item_bom_versions (
  company_id, parent_item_id, version, status, effective_from, effective_to,
  legacy_bom_version_id, created_by, updated_by, created_at, updated_at
)
SELECT
  bomv.company_id, bomv.product_id, bomv.version, bomv.status,
  bomv.effective_from, bomv.effective_to,
  bomv.id, bomv.created_by, bomv.updated_by, bomv.created_at, bomv.updated_at
FROM bom_versions bomv
WHERE bomv.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM items i WHERE i.id = bomv.product_id)
ON CONFLICT DO NOTHING;


-- ── 4) product_pcbs → item_bom_lines ────────────────────────────────────────
-- child = the pcb_revision's item mirror. qty + sequence carry over; ref_des is
-- NULL for product→pcb lines (that field is board-part specific).
INSERT INTO item_bom_lines (
  company_id, bom_version_id, child_item_id, qty, sequence, remarks,
  created_by, updated_by, created_at, updated_at
)
SELECT
  pp.company_id, bv.id, pp.pcb_revision_id, pp.qty, pp.sequence, pp.remarks,
  pp.created_by, pp.updated_by, pp.created_at, pp.updated_at
FROM product_pcbs pp
JOIN item_bom_versions bv ON bv.legacy_bom_version_id = pp.bom_version_id
WHERE pp.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM items i WHERE i.id = pp.pcb_revision_id)
ON CONFLICT DO NOTHING;

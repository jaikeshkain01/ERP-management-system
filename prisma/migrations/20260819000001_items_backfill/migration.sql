-- ============================================================================
--  F2 — BACKFILL items + item_variants FROM components / products / pcb_revisions
-- ============================================================================
-- Second step of the universal-item transformation (see project_universal_item).
-- After F1 created the empty tables, this migration mirrors every legacy row
-- into `items` + `item_variants`, REUSING the source uuid as `items.id` so the
-- FK repoint in F3+ is a column swap, not an id rewrite.
--
-- LOSSLESS: soft-deleted rows are included too, preserving `deleted_at`. This
-- guarantees that any legacy reference (BOM lines, ledger rows) that still
-- points at a deleted component/product/pcb_revision will find its item mirror
-- when FKs are repointed in later migrations.
--
-- CODE COLLISION HANDLING: `items.code` is unique per tenant across all types
-- (F1 partial unique index). Components use `generic_pn` as-is (already unique
-- per tenant). Products use `code` and PCB-revisions use `{pcb.slug}-{rev}`;
-- if either collides with something already in `items`, we prefix with
-- 'PROD-' / 'PCB-'. A second collision falls back to a numeric suffix — the
-- loop below tries up to 5 variants before giving up.
--
-- IS_DEFAULT: for a component that has multiple brand variants, the OLDEST
-- variant (min created_at, tiebreak by id) is marked default. Products and
-- pcb_revisions have exactly one manufactured variant, so it's default trivially.
--
-- STATUS: everything backfills as `status='active'`. Source-status mapping
-- (products.status, pcb_revisions.status) is a semantic step, deliberately
-- deferred — F5's cutover UI is where reviewers can adjust individual items.
--
-- Apply with:  npx prisma migrate deploy


-- 1) Components → items ------------------------------------------------------
-- Straight mirror. generic_pn is already unique-per-tenant, and items is empty
-- at this point (F1 just created it), so no collision is possible here.
INSERT INTO items (
  id, company_id, code, name, description, category_id, item_type, base_uom,
  min_stock, reorder_qty, safety_stock, lead_time_days, specs, status,
  created_by, updated_by, created_at, updated_at, deleted_at
)
SELECT
  c.id, c.company_id, c.generic_pn, c.name, c.description,
  c.category_id, c.item_type, c.unit,
  c.min_stock, c.reorder_qty, 0, NULL, c.specs, 'active'::item_status,
  c.created_by, c.updated_by, c.created_at, c.updated_at, c.deleted_at
FROM components c
ON CONFLICT (id) DO NOTHING;


-- 2) component_brand_variants → item_variants (purchased) --------------------
-- The oldest variant per component becomes the default (row_number window).
-- Reusing cbv.id as item_variants.id so the ledger's future `item_variant_id`
-- column (F3) can be back-populated with the same uuid as
-- `component_brand_variant_id` — makes F3 a pure alias step.
INSERT INTO item_variants (
  id, company_id, item_id, source_kind, brand_id, part_no, is_default,
  status, created_by, updated_by, created_at, updated_at, deleted_at
)
SELECT
  cbv.id, cbv.company_id, cbv.component_id, 'purchased'::item_variant_source,
  cbv.brand_id, cbv.part_no,
  (row_number() OVER (
    PARTITION BY cbv.company_id, cbv.component_id
    ORDER BY cbv.deleted_at NULLS FIRST, cbv.created_at, cbv.id
  ) = 1) AS is_default,
  'active'::item_status,
  cbv.created_by, cbv.updated_by, cbv.created_at, cbv.updated_at, cbv.deleted_at
FROM component_brand_variants cbv
WHERE EXISTS (SELECT 1 FROM items i WHERE i.id = cbv.component_id)
ON CONFLICT (id) DO NOTHING;


-- 3) Products → items (with collision-resilient code) ------------------------
-- A plpgsql loop lets us catch a unique_violation on `code` and retry with
-- 'PROD-' prefix, then 'PROD-{code}-2', 'PROD-{code}-3', … up to 5 attempts.
-- Postgres wraps each BEGIN…EXCEPTION block in an implicit savepoint, so the
-- failed INSERT rolls back cleanly and the retry sees a clean slate.
DO $F2_PRODUCTS$
DECLARE
  r RECORD;
  target_code text;
  attempt int;
BEGIN
  FOR r IN
    SELECT p.id, p.company_id, p.code, p.name, p.description, p.status,
           p.created_by, p.updated_by, p.created_at, p.updated_at, p.deleted_at
    FROM products p
    WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = p.id)
  LOOP
    target_code := r.code;
    attempt := 0;
    LOOP
      BEGIN
        INSERT INTO items (
          id, company_id, code, name, description, category_id, item_type,
          base_uom, min_stock, reorder_qty, safety_stock, lead_time_days,
          specs, status, created_by, updated_by, created_at, updated_at, deleted_at
        ) VALUES (
          r.id, r.company_id, target_code, r.name, r.description,
          NULL, 'assembled'::item_type, 'PCS', 0, 0, 0, NULL,
          '[]'::jsonb, 'active'::item_status,
          r.created_by, r.updated_by, r.created_at, r.updated_at, r.deleted_at
        );
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        attempt := attempt + 1;
        IF attempt = 1 THEN
          target_code := 'PROD-' || r.code;
        ELSIF attempt > 5 THEN
          RAISE EXCEPTION 'F2: could not find a unique item code for product % (last attempt %)', r.code, target_code;
        ELSE
          target_code := 'PROD-' || r.code || '-' || attempt::text;
        END IF;
      END;
    END LOOP;
  END LOOP;
END
$F2_PRODUCTS$;

-- One manufactured variant per product-item (brand_id=NULL by check constraint).
INSERT INTO item_variants (
  company_id, item_id, source_kind, brand_id, part_no, is_default,
  status, created_by, updated_by, created_at, updated_at, deleted_at
)
SELECT
  p.company_id, p.id, 'manufactured'::item_variant_source, NULL, NULL, true,
  'active'::item_status,
  p.created_by, p.updated_by, p.created_at, p.updated_at, p.deleted_at
FROM products p
JOIN items i ON i.id = p.id AND i.item_type = 'assembled'
WHERE NOT EXISTS (
  SELECT 1 FROM item_variants v
  WHERE v.item_id = p.id AND v.source_kind = 'manufactured'
);


-- 4) PCB revisions → items (semi_assembled) ----------------------------------
-- The item is the REVISION, not the PCB header — because a PCB has multiple
-- revisions each with its own BOM, and production makes a specific revision.
-- Code default = '{pcb.slug}-{rev}'; on collision, prefix with 'PCB-'.
DO $F2_PCB_REVS$
DECLARE
  r RECORD;
  target_code text;
  target_name text;
  attempt int;
BEGIN
  FOR r IN
    SELECT pr.id, pr.company_id, pr.rev, p.slug AS pcb_slug, p.name AS pcb_name,
           p.description AS pcb_description,
           pr.created_by, pr.updated_by, pr.created_at, pr.updated_at, pr.deleted_at
    FROM pcb_revisions pr
    JOIN pcbs p ON p.id = pr.pcb_id
    WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = pr.id)
  LOOP
    target_code := r.pcb_slug || '-' || r.rev;
    target_name := r.pcb_name || ' Rev ' || r.rev;
    attempt := 0;
    LOOP
      BEGIN
        INSERT INTO items (
          id, company_id, code, name, description, category_id, item_type,
          base_uom, min_stock, reorder_qty, safety_stock, lead_time_days,
          specs, status, created_by, updated_by, created_at, updated_at, deleted_at
        ) VALUES (
          r.id, r.company_id, target_code, target_name, r.pcb_description,
          NULL, 'semi_assembled'::item_type, 'PCS', 0, 0, 0, NULL,
          '[]'::jsonb, 'active'::item_status,
          r.created_by, r.updated_by, r.created_at, r.updated_at, r.deleted_at
        );
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        attempt := attempt + 1;
        IF attempt = 1 THEN
          target_code := 'PCB-' || r.pcb_slug || '-' || r.rev;
        ELSIF attempt > 5 THEN
          RAISE EXCEPTION 'F2: could not find a unique item code for pcb_revision %/% (last attempt %)', r.pcb_slug, r.rev, target_code;
        ELSE
          target_code := 'PCB-' || r.pcb_slug || '-' || r.rev || '-' || attempt::text;
        END IF;
      END;
    END LOOP;
  END LOOP;
END
$F2_PCB_REVS$;

-- One manufactured variant per pcb_revision-item.
INSERT INTO item_variants (
  company_id, item_id, source_kind, brand_id, part_no, is_default,
  status, created_by, updated_by, created_at, updated_at, deleted_at
)
SELECT
  pr.company_id, pr.id, 'manufactured'::item_variant_source, NULL, NULL, true,
  'active'::item_status,
  pr.created_by, pr.updated_by, pr.created_at, pr.updated_at, pr.deleted_at
FROM pcb_revisions pr
JOIN items i ON i.id = pr.id AND i.item_type = 'semi_assembled'
WHERE NOT EXISTS (
  SELECT 1 FROM item_variants v
  WHERE v.item_id = pr.id AND v.source_kind = 'manufactured'
);

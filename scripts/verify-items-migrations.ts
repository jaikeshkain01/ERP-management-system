/**
 * Verify F1 + F2 + F3 of the universal-item transformation.
 *
 *   npx tsx scripts/verify-items-migrations.ts
 *
 * Uses DIRECT_URL (the owner role) so we can read across every tenant without
 * setting an app.current_company_id GUC. Read-only. Safe to run repeatedly.
 *
 * Every check prints one line:
 *   ✓ passed  or  ✗ FAILED — <details>
 * Exit code = number of failed checks (0 on full pass).
 */
import "dotenv/config";
import { Client } from "pg";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DIRECT_URL / DATABASE_URL not set");
  process.exit(2);
}

const client = new Client({ connectionString: url });
let failed = 0;

async function q<T = unknown>(sql: string): Promise<T[]> {
  const r = await client.query(sql);
  return r.rows as T[];
}

function pass(name: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${name}`);
}
function fail(name: string, detail: unknown) {
  failed++;
  console.log(`  \x1b[31m✗ FAILED\x1b[0m ${name}`);
  console.log(`      ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}
async function expectZero(name: string, sql: string) {
  const rows = await q<{ n: string | number }>(`SELECT count(*)::int AS n FROM (${sql}) sub`);
  const n = Number(rows[0]?.n ?? 0);
  n === 0 ? pass(`${name} (0 orphans)`) : fail(name, `${n} orphan row(s)`);
}
async function expectRows(name: string, sql: string, minCount = 1) {
  const rows = await q<Record<string, unknown>>(sql);
  rows.length >= minCount
    ? pass(`${name} (${rows.length} row${rows.length === 1 ? "" : "s"})`)
    : fail(name, `expected ≥${minCount} row(s), got ${rows.length}`);
}

async function main() {
  await client.connect();
  console.log(`\n\x1b[36m── connected as owner via DIRECT_URL ──\x1b[0m`);

  // ───────────────────────────── F1 ─────────────────────────────
  console.log(`\n\x1b[1mF1 — Universal Item Master (structural)\x1b[0m`);
  await expectRows(
    "items and item_variants tables exist",
    `SELECT tablename FROM pg_tables WHERE tablename IN ('items','item_variants')`,
    2,
  );
  await expectRows(
    "enums item_status and item_variant_source exist",
    `SELECT typname FROM pg_type WHERE typname IN ('item_status','item_variant_source')`,
    2,
  );
  await expectRows(
    "RLS forced on both new tables",
    `SELECT relname FROM pg_class
     WHERE relname IN ('items','item_variants') AND relrowsecurity AND relforcerowsecurity`,
    2,
  );
  await expectRows(
    "tenant_isolation policy on both new tables",
    `SELECT tablename FROM pg_policies
     WHERE tablename IN ('items','item_variants') AND policyname = 'tenant_isolation'`,
    2,
  );
  await expectRows(
    "audit + updated_at triggers on items",
    `SELECT trigger_name FROM information_schema.triggers
     WHERE event_object_table = 'items' AND trigger_name IN ('trg_items_updated','trg_items_audit')`,
    2,
  );

  // ───────────────────────────── F2 ─────────────────────────────
  console.log(`\n\x1b[1mF2 — Backfill from legacy tables\x1b[0m`);
  await expectZero(
    "every component has an item mirror",
    `SELECT c.id FROM components c WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = c.id)`,
  );
  await expectZero(
    "every component_brand_variant has an item_variant mirror",
    `SELECT cbv.id FROM component_brand_variants cbv
     WHERE EXISTS (SELECT 1 FROM items i WHERE i.id = cbv.component_id)
       AND NOT EXISTS (SELECT 1 FROM item_variants v WHERE v.id = cbv.id)`,
  );
  await expectZero(
    "every product has an item mirror",
    `SELECT p.id FROM products p WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = p.id)`,
  );
  await expectZero(
    "every product-item has exactly one manufactured variant",
    `SELECT p.id FROM products p
     JOIN items i ON i.id = p.id
     LEFT JOIN item_variants v ON v.item_id = p.id AND v.source_kind = 'manufactured'
     GROUP BY p.id HAVING count(v.id) <> 1`,
  );
  await expectZero(
    "every pcb_revision has an item mirror",
    `SELECT pr.id FROM pcb_revisions pr WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = pr.id)`,
  );
  await expectZero(
    "every pcb_revision-item has exactly one manufactured variant",
    `SELECT pr.id FROM pcb_revisions pr
     JOIN items i ON i.id = pr.id
     LEFT JOIN item_variants v ON v.item_id = pr.id AND v.source_kind = 'manufactured'
     GROUP BY pr.id HAVING count(v.id) <> 1`,
  );
  await expectZero(
    "item_type matches source category (product→assembled, pcb→semi_assembled, component→as-set)",
    `SELECT id FROM (
       SELECT p.id FROM products p JOIN items i ON i.id = p.id WHERE i.item_type <> 'assembled'
       UNION ALL
       SELECT pr.id FROM pcb_revisions pr JOIN items i ON i.id = pr.id WHERE i.item_type <> 'semi_assembled'
       UNION ALL
       SELECT c.id FROM components c JOIN items i ON i.id = c.id WHERE i.item_type <> c.item_type
     ) x`,
  );
  await expectZero(
    "items.code is unique per tenant (live rows only)",
    `SELECT company_id FROM items WHERE deleted_at IS NULL
     GROUP BY company_id, code HAVING count(*) > 1`,
  );
  await expectZero(
    "manufactured variants have NULL brand_id",
    `SELECT id FROM item_variants WHERE source_kind = 'manufactured' AND brand_id IS NOT NULL`,
  );
  await expectZero(
    "purchased variants have NOT NULL brand_id",
    `SELECT id FROM item_variants WHERE source_kind = 'purchased' AND brand_id IS NULL`,
  );
  await expectZero(
    "items with active variants have exactly one default",
    `SELECT i.id FROM items i
     LEFT JOIN item_variants v ON v.item_id = i.id
     GROUP BY i.id
     HAVING count(v.id) FILTER (WHERE v.deleted_at IS NULL) > 0
        AND count(v.id) FILTER (WHERE v.is_default AND v.deleted_at IS NULL) <> 1`,
  );

  // ───────────────────────────── F3 ─────────────────────────────
  console.log(`\n\x1b[1mF3 — Ledger dual-write on item_variant_id\x1b[0m`);
  for (const t of ["inventory_transactions", "inventory_balances", "item_lots", "production_material_moves"]) {
    await expectZero(
      `no NULL item_variant_id in ${t}`,
      `SELECT 1 FROM ${t} WHERE item_variant_id IS NULL`,
    );
    await expectZero(
      `${t}: item_variant_id == component_brand_variant_id on every row (F3 invariant)`,
      `SELECT 1 FROM ${t} WHERE item_variant_id <> component_brand_variant_id`,
    );
  }
  await expectRows(
    "BEFORE INSERT sync trigger on all 3 source tables",
    `SELECT event_object_table FROM information_schema.triggers
     WHERE trigger_name IN (
       'trg_inv_txn_sync_item_variant',
       'trg_item_lots_sync_item_variant',
       'trg_pmm_sync_item_variant'
     )`,
    3,
  );
  await expectRows(
    "FK constraints on all 4 tables",
    `SELECT conname FROM pg_constraint WHERE conname IN (
       'fk_inv_txn_item_variant',
       'fk_inv_bal_item_variant',
       'fk_item_lots_item_variant',
       'fk_pmm_item_variant'
     )`,
    4,
  );
  await expectRows(
    "apply_inventory_txn references item_variant_id",
    `SELECT 1 FROM pg_proc
     WHERE proname = 'apply_inventory_txn' AND pg_get_functiondef(oid) LIKE '%item_variant_id%'`,
  );
  await expectRows(
    "mirror unique index on balances (item_variant_id, location_id)",
    `SELECT 1 FROM pg_indexes WHERE indexname = 'uq_inventory_balances_item_variant_location'`,
  );
  await expectZero(
    "balances rollup: same totals whichever variant column keys the sum",
    `SELECT * FROM (
       SELECT a.location_id, a.tot AS via_cbv, b.tot AS via_iv FROM (
         SELECT component_brand_variant_id AS k, location_id, sum(on_hand) AS tot
         FROM inventory_balances GROUP BY component_brand_variant_id, location_id) a
       FULL OUTER JOIN (
         SELECT item_variant_id AS k, location_id, sum(on_hand) AS tot
         FROM inventory_balances GROUP BY item_variant_id, location_id) b
         ON a.k = b.k AND a.location_id = b.location_id
     ) x WHERE via_cbv IS DISTINCT FROM via_iv`,
  );

  // ─────────────────────── summary counts (informational) ───────────────────
  console.log(`\n\x1b[1mSummary\x1b[0m`);
  const summary = await q<Record<string, string>>(`
    SELECT
      (SELECT count(*) FROM components)                                          AS src_components,
      (SELECT count(*) FROM component_brand_variants)                            AS src_cbv,
      (SELECT count(*) FROM products)                                            AS src_products,
      (SELECT count(*) FROM pcb_revisions)                                       AS src_pcb_revisions,
      (SELECT count(*) FROM items WHERE item_type = 'raw')                       AS items_raw,
      (SELECT count(*) FROM items WHERE item_type = 'assembled')                 AS items_assembled,
      (SELECT count(*) FROM items WHERE item_type = 'semi_assembled')            AS items_semi_assembled,
      (SELECT count(*) FROM items)                                               AS items_total,
      (SELECT count(*) FROM item_variants WHERE source_kind = 'purchased')       AS iv_purchased,
      (SELECT count(*) FROM item_variants WHERE source_kind = 'manufactured')    AS iv_manufactured,
      (SELECT count(*) FROM inventory_transactions)                              AS ledger_rows,
      (SELECT count(*) FROM inventory_balances)                                  AS balance_rows,
      (SELECT count(*) FROM item_lots)                                           AS lots,
      (SELECT count(*) FROM production_material_moves)                          AS material_moves`);
  console.table(summary[0]);

  await client.end();
  if (failed) {
    console.log(`\n\x1b[31m${failed} check(s) FAILED.\x1b[0m Investigate before proceeding to F4/F5.`);
    process.exit(failed);
  }
  console.log(`\n\x1b[32mAll checks passed.\x1b[0m F1–F3 verified.`);
}

main().catch(async (e) => {
  console.error(e);
  try { await client.end(); } catch { /* noop */ }
  process.exit(1);
});

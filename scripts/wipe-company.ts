/**
 * One-shot fresh-setup wipe for a single company.
 *
 *   npx tsx scripts/wipe-company.ts "<Company Name>"
 *
 * Runs the full DELETE stack in one transaction. Preserves users, roles,
 * categories and warehouses. Re-seeds the "no-manufacturer" placeholder
 * brand at the end so the next BOM import doesn't have to self-heal it.
 */
import "dotenv/config";
import { Client } from "pg";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) { console.error("DIRECT_URL / DATABASE_URL not set"); process.exit(2); }

const companyName = process.argv[2];
if (!companyName) { console.error("Usage: wipe-company.ts \"<Company Name>\""); process.exit(2); }

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();

  const found = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM companies WHERE name ILIKE $1 ORDER BY name`,
    [companyName],
  );
  if (found.rows.length === 0) {
    console.error(`No company matches "${companyName}".`);
    await client.end();
    process.exit(1);
  }
  if (found.rows.length > 1) {
    console.error(`Ambiguous — ${found.rows.length} companies match. Be more specific:`);
    for (const c of found.rows) console.error(`  ${c.id}  ${c.name}`);
    await client.end();
    process.exit(1);
  }
  const cid = found.rows[0].id;
  console.log(`Wiping company: ${found.rows[0].name}\n  id: ${cid}\n`);

  await client.query("BEGIN");
  try {
    const steps: [string, string][] = [
      ["inventory_transactions",     "inventory_transactions"],
      ["inventory_balances",         "inventory_balances"],
      ["purchase_order_items",       "purchase_order_items"],
      ["purchase_orders",            "purchase_orders"],
      ["purchase_request_items",     "purchase_request_items"],
      ["purchase_requests",          "purchase_requests"],
      ["production_material_moves",  "production_material_moves"],
      ["production_order_items",     "production_order_items"],
      ["production_orders",          "production_orders"],
      ["item_bom_lines",             "item_bom_lines"],
      ["item_bom_versions",          "item_bom_versions"],
      ["item_serials",               "item_serials"],
      ["item_lots",                  "item_lots"],
      ["item_variants",              "item_variants"],
      ["items",                      "items"],
      ["supplier_component_prices",  "supplier_component_prices (legacy)"],
      ["component_brand_variants",   "component_brand_variants (legacy)"],
      ["pcb_lines",                  "pcb_lines (legacy)"],
      ["bom_versions",               "bom_versions (legacy)"],
      ["product_pcbs",               "product_pcbs (legacy)"],
      ["pcb_revisions",              "pcb_revisions (legacy)"],
      ["pcbs",                       "pcbs (legacy)"],
      ["products",                   "products (legacy)"],
      ["components",                 "components (legacy)"],
      ["custom_bom_versions",        "custom_bom_versions (legacy)"],
      ["custom_products",            "custom_products (legacy)"],
      ["brand_suppliers",            "brand_suppliers"],
      ["brands",                     "brands"],
      ["suppliers",                  "suppliers"],
      ["approvals",                  "approvals"],
      ["notifications",              "notifications"],
    ];

    let total = 0;
    for (const [table, label] of steps) {
      const exists = await client.query<{ hit: boolean }>(
        `SELECT to_regclass($1) IS NOT NULL AS hit`, [table],
      );
      if (!exists.rows[0]?.hit) {
        console.log(`  skip   ${label.padEnd(42)}  (table absent)`);
        continue;
      }
      const res = await client.query(
        `DELETE FROM ${table} WHERE company_id = $1::uuid`, [cid],
      );
      total += res.rowCount ?? 0;
      console.log(`  wipe   ${label.padEnd(42)}  ${res.rowCount ?? 0} row(s)`);
    }

    await client.query(
      `INSERT INTO brands (company_id, slug, name, description, status)
       VALUES ($1::uuid, 'no-manufacturer', 'No Manufacturer',
               'Placeholder brand for imported parts with no manufacturer specified.',
               'Approved'::brand_status)
       ON CONFLICT DO NOTHING`,
      [cid],
    );
    console.log(`  reseed no-manufacturer brand`);

    await client.query("COMMIT");
    console.log(`\nDone. ${total} row(s) deleted across the catalog.`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(`\nRolled back:`, e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

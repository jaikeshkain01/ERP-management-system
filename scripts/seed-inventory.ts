/**
 * Seed opening inventory for the seeded company:
 *   - a MAIN warehouse + one default bin (storage_locations leaf)
 *   - one opening-stock IN ledger row per component_brand_variant, using the mock
 *     brandVariant stock levels. The apply_inventory_txn trigger projects these
 *     into inventory_balances automatically.
 *
 *   npx tsx scripts/seed-inventory.ts
 *
 * Runs as OWNER (DIRECT_URL, bypasses RLS). Idempotent: skips variants that
 * already have an 'opening' ledger row.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { COMPONENTS } from "../src/mockdata/components";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });

async function main() {
  const company = await prisma.companies.findFirst({ where: { code: "STACKIOT" }, select: { id: true } });
  const admin = await prisma.users.findFirst({ where: { email: "admin@stackiot.local" }, select: { id: true } });
  if (!company || !admin) throw new Error("Seed the schema + sample product first.");
  const companyId = company.id;
  const audit = { company_id: companyId, created_by: admin.id, updated_by: admin.id };

  // mock stock lookup: `${genericPN}|${brandSlug}` → stock
  const stockByKey = new Map<string, number>();
  for (const c of COMPONENTS) for (const v of c.brandVariants) stockByKey.set(`${c.genericPN}|${v.brandId}`, v.stock);

  let warehouseId: string;
  let binId: string;

  const counts = { warehouse: 0, bin: 0, openingTxns: 0, skipped: 0, noStock: 0 };

  await prisma.$transaction(async (tx) => {
    // 1) MAIN warehouse
    const wh = await tx.warehouses.findFirst({ where: { company_id: companyId, code: "MAIN", deleted_at: null }, select: { id: true } });
    if (wh) {
      warehouseId = wh.id;
    } else {
      const row = await tx.warehouses.create({
        data: { ...audit, code: "MAIN", name: "Main Warehouse", location: "HQ", is_finished_goods: false },
        select: { id: true },
      });
      warehouseId = row.id; counts.warehouse++;
    }

    // 2) default bin (leaf) — holds un-slotted stock
    const bin = await tx.storage_locations.findFirst({
      where: { company_id: companyId, warehouse_id: warehouseId, code: "MAIN-BIN", deleted_at: null },
      select: { id: true },
    });
    if (bin) {
      binId = bin.id;
    } else {
      const row = await tx.storage_locations.create({
        data: { ...audit, warehouse_id: warehouseId, parent_id: null, kind: "bin", code: "MAIN-BIN", name: "Default Bin", is_default: true },
        select: { id: true },
      });
      binId = row.id; counts.bin++;
    }

    // 3) opening stock per variant
    const variants = await tx.$queryRaw<{ id: string; generic_pn: string; brand_slug: string }[]>`
      SELECT v.id, c.generic_pn, b.slug AS brand_slug
      FROM component_brand_variants v
      JOIN components c ON c.id = v.component_id
      JOIN brands b ON b.id = v.brand_id
      WHERE v.company_id = ${companyId}::uuid AND v.deleted_at IS NULL`;

    for (const v of variants) {
      const existing = await tx.inventory_transactions.findFirst({
        where: { component_brand_variant_id: v.id, ref_type: "opening" },
        select: { id: true },
      });
      if (existing) { counts.skipped++; continue; }

      const qty = stockByKey.get(`${v.generic_pn}|${v.brand_slug}`);
      if (qty == null || qty <= 0) { counts.noStock++; continue; }

      await tx.inventory_transactions.create({
        data: {
          company_id: companyId,
          type: "IN",
          component_brand_variant_id: v.id,
          warehouse_id: warehouseId,
          location_id: binId,
          qty_delta: qty,
          ref_type: "opening",
          reason: "Opening balance",
          created_by: admin.id,
        },
      });
      counts.openingTxns++;
    }
  }, { timeout: 60_000 });

  console.log("✅ Seeded opening inventory into STACKIOT / MAIN:");
  console.table(counts);
}

main()
  .catch((e) => { console.error("seed-inventory error:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

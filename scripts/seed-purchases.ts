/**
 * Seed the mock purchase requests/orders into the DB (header + items).
 *   npx tsx scripts/seed-purchases.ts
 *
 * Status mapping: "Pending Approval" → Submitted; "Approved" → PO Created (those
 * PRs have POs in the mock). Completed POs get received_qty = qty but NO ledger
 * rows — opening stock (seed-inventory) already reflects current levels.
 * Runs as OWNER (DIRECT_URL). Idempotent by pr_no/po_no. Rows referencing
 * entities missing from the DB are skipped with a warning.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { COMPONENTS } from "../src/mockdata/components";
import { PURCHASE_ORDERS, PURCHASE_REQUESTS } from "../src/mockdata/purchases";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });

const pnBySlug = new Map(COMPONENTS.map((c) => [c.id, c.genericPN]));
const money = (s: string) => parseFloat(s.replace(/[^\d.]/g, "")) || 0;

async function main() {
  const company = await prisma.companies.findFirst({ where: { code: "STACKIOT" }, select: { id: true } });
  const admin = await prisma.users.findFirst({ where: { email: "admin@stackiot.local" }, select: { id: true } });
  if (!company || !admin) throw new Error("Seed the schema + sample data first.");
  const audit = { company_id: company.id, created_by: admin.id, updated_by: admin.id };

  const counts = { prs: 0, pos: 0, skipped: 0, existing: 0 };
  const prIdByNo = new Map<string, string>();

  await prisma.$transaction(async (tx) => {
    for (const pr of PURCHASE_REQUESTS) {
      const existing = await tx.purchase_requests.findFirst({ where: { pr_no: pr.prId, deleted_at: null }, select: { id: true } });
      if (existing) { prIdByNo.set(pr.prId, existing.id); counts.existing++; continue; }

      const pn = pnBySlug.get(pr.componentId);
      const component = pn ? await tx.components.findFirst({ where: { generic_pn: pn, deleted_at: null }, select: { id: true } }) : null;
      const brand = await tx.brands.findFirst({ where: { slug: pr.brandId, deleted_at: null }, select: { id: true } });
      const supplier = await tx.suppliers.findFirst({ where: { slug: pr.supplierId, deleted_at: null }, select: { id: true } });
      if (!component || !supplier) {
        console.warn(`  ⚠ skipping ${pr.prId}: unresolved ${!component ? `component ${pr.componentId}` : `supplier ${pr.supplierId}`}`);
        counts.skipped++;
        continue;
      }

      const total = money(pr.totalCost);
      const status = pr.status === "Approved" ? "PO_Created" : "Submitted";
      const row = await tx.purchase_requests.create({
        data: { ...audit, pr_no: pr.prId, status, requested_by: admin.id, request_date: new Date(pr.date), total_cost: total },
        select: { id: true },
      });
      await tx.purchase_request_items.create({
        data: {
          ...audit, purchase_request_id: row.id, component_id: component.id,
          brand_id: brand?.id ?? null, supplier_id: supplier.id,
          qty: pr.qty, unit_price: total / pr.qty, line_total: total,
        },
      });
      prIdByNo.set(pr.prId, row.id);
      counts.prs++;
    }

    for (const po of PURCHASE_ORDERS) {
      const existing = await tx.purchase_orders.findFirst({ where: { po_no: po.poId, deleted_at: null }, select: { id: true } });
      if (existing) { counts.existing++; continue; }

      const prId = prIdByNo.get(po.prId) ?? null;
      const prItem = prId
        ? await tx.purchase_request_items.findFirst({
            where: { purchase_request_id: prId, deleted_at: null },
            select: { id: true, component_id: true, brand_id: true, supplier_id: true },
          })
        : null;
      if (!prItem?.supplier_id) {
        console.warn(`  ⚠ skipping ${po.poId}: source PR ${po.prId} not seeded`);
        counts.skipped++;
        continue;
      }

      const total = money(po.totalCost);
      const row = await tx.purchase_orders.create({
        data: {
          ...audit, po_no: po.poId, pr_id: prId, supplier_id: prItem.supplier_id,
          status: po.status, order_date: new Date(po.date), total_cost: total,
        },
        select: { id: true },
      });
      await tx.purchase_order_items.create({
        data: {
          ...audit, purchase_order_id: row.id, pr_item_id: prItem.id,
          component_id: prItem.component_id, brand_id: prItem.brand_id,
          qty: po.qty, unit_price: total / po.qty, line_total: total,
          received_qty: po.status === "Completed" ? po.qty : 0,
        },
      });
      counts.pos++;
    }
  }, { timeout: 60_000 });

  console.log("✅ Seeded purchasing documents:");
  console.table(counts);
}

main()
  .catch((e) => { console.error("seed-purchases error:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

// @ts-nocheck — references retired tables (bom_versions, pcb_lines,
// product_pcbs) dropped in the D3/D4 slice. Needs a rewrite against the
// universal item_bom_versions/item_bom_lines shape before it runs again.
// Excluded from tsconfig for now so it doesn't gate the typecheck.
/**
 * Seed a SINGLE product and its full graph from scripts/seed-data into the DB:
 *   product → bom_version → product_pcbs → pcb_revisions → pcb_lines →
 *   components → component_brand_variants + supplier_component_prices → brands + suppliers
 *
 *   npx tsx scripts/seed-sample.ts            # seeds ROIP 400 (roip-400)
 *   npx tsx scripts/seed-sample.ts voice-logger
 *
 * Runs as the OWNER (DIRECT_URL) so RLS is bypassed during seeding; company_id and
 * created_by/updated_by are set explicitly. Idempotent: re-running reuses existing
 * rows (matched by business key) instead of duplicating. Inventory/stock is NOT
 * seeded here — that's the ledger's job (a separate step).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { PRODUCTS } from "./seed-data/products";
import { PCBS } from "./seed-data/pcbs";
import { COMPONENTS } from "./seed-data/components";
import { BRANDS } from "./seed-data/brands";
import { SUPPLIERS } from "./seed-data/suppliers";

const TARGET = process.argv[2] ?? "roip-400";

// Owner connection: schema-management URL, bypasses RLS.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }),
});

async function main() {
  const product = PRODUCTS.find((p) => p.id === TARGET);
  if (!product) throw new Error(`Product "${TARGET}" not found in mockdata`);

  // Resolve tenant + actor (as owner, no RLS).
  const company = await prisma.companies.findFirst({ where: { code: "STACKIOT" }, select: { id: true } });
  const admin = await prisma.users.findFirst({ where: { email: "admin@stackiot.local" }, select: { id: true } });
  if (!company || !admin) throw new Error("Seed the schema first (companies/users missing).");
  const companyId = company.id;
  const actor = admin.id;
  const audit = { company_id: companyId, created_by: actor, updated_by: actor };

  // ── Transitive closure of the product graph ────────────────────────────────
  const pcbs = product.pcbs.map((ref) => {
    const pcb = PCBS.find((p) => p.id === ref.pcbId);
    if (!pcb) throw new Error(`PCB "${ref.pcbId}" (used by ${product.id}) not found`);
    return pcb;
  });
  const componentIds = new Set(pcbs.flatMap((pcb) => pcb.lines.map((l) => l.componentId)));
  const components = [...componentIds].map((id) => {
    const c = COMPONENTS.find((x) => x.id === id);
    if (!c) throw new Error(`Component "${id}" not found`);
    return c;
  });
  const brandIds = new Set<string>();
  const supplierIds = new Set<string>();
  for (const pcb of pcbs) for (const l of pcb.lines) if (l.preferredBrandId) brandIds.add(l.preferredBrandId);
  for (const c of components) {
    for (const v of c.brandVariants) brandIds.add(v.brandId);
    for (const o of c.offers) {
      brandIds.add(o.brandId);
      supplierIds.add(o.supplierId);
    }
  }

  // id maps: mock string id → generated uuid
  const brandUuid = new Map<string, string>();
  const supplierUuid = new Map<string, string>();
  const componentUuid = new Map<string, string>();
  const pcbRevUuid = new Map<string, string>(); // keyed by pcb mock id → active revision uuid

  const counts = {
    brands: 0, suppliers: 0, components: 0, variants: 0, prices: 0,
    pcbs: 0, pcbRevisions: 0, pcbLines: 0, product: 0, bomVersion: 0, productPcbs: 0,
  };

  await prisma.$transaction(async (tx) => {
    // 1) Brands ---------------------------------------------------------------
    for (const id of brandIds) {
      const b = BRANDS.find((x) => x.id === id);
      if (!b) throw new Error(`Brand "${id}" not found`);
      const existing = await tx.brands.findFirst({ where: { company_id: companyId, slug: id, deleted_at: null }, select: { id: true } });
      if (existing) { brandUuid.set(id, existing.id); continue; }
      const row = await tx.brands.create({
        data: {
          ...audit, slug: id, name: b.name, description: b.description,
          headquarter: b.headquarter, founded: b.founded, status: b.status, rating: b.rating,
        },
        select: { id: true },
      });
      brandUuid.set(id, row.id); counts.brands++;
    }

    // 2) Suppliers ------------------------------------------------------------
    for (const id of supplierIds) {
      const s = SUPPLIERS.find((x) => x.id === id);
      if (!s) throw new Error(`Supplier "${id}" not found`);
      const existing = await tx.suppliers.findFirst({ where: { company_id: companyId, slug: id, deleted_at: null }, select: { id: true } });
      if (existing) { supplierUuid.set(id, existing.id); continue; }
      const row = await tx.suppliers.create({
        data: {
          ...audit, slug: id, name: s.name, description: s.description, contact: s.contact,
          email: s.email, phone: s.phone, address: s.address, terms: s.terms, rating: s.rating, status: s.status,
        },
        select: { id: true },
      });
      supplierUuid.set(id, row.id); counts.suppliers++;
    }

    // 3) Components (+ variants + price book) ----------------------------------
    for (const c of components) {
      let compId: string;
      const existing = await tx.components.findFirst({ where: { company_id: companyId, generic_pn: c.genericPN, deleted_at: null }, select: { id: true } });
      if (existing) {
        compId = existing.id;
      } else {
        const row = await tx.components.create({
          data: {
            ...audit, generic_pn: c.genericPN, name: c.name, category: c.category, description: c.description,
            unit: c.unit, solder_type: c.solderType, footprint: c.footprint, spq: c.spq,
            min_stock: c.minStock, reorder_qty: c.reorderQty, annual_consumption: c.annualConsumption,
            specs: c.specs as unknown as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        compId = row.id; counts.components++;
      }
      componentUuid.set(c.id, compId);

      // brand variants
      for (const v of c.brandVariants) {
        const brandId = brandUuid.get(v.brandId);
        if (!brandId) continue;
        const ex = await tx.component_brand_variants.findFirst({ where: { company_id: companyId, component_id: compId, brand_id: brandId, deleted_at: null }, select: { id: true } });
        if (ex) continue;
        await tx.component_brand_variants.create({ data: { ...audit, component_id: compId, brand_id: brandId, part_no: v.partNo } });
        counts.variants++;
      }

      // supplier price book (from offers) — one open (valid_to NULL) row per (supplier, brand)
      for (const o of c.offers) {
        const supplierId = supplierUuid.get(o.supplierId);
        const brandId = brandUuid.get(o.brandId);
        if (!supplierId || !brandId) continue;
        const ex = await tx.supplier_component_prices.findFirst({
          where: { company_id: companyId, component_id: compId, supplier_id: supplierId, brand_id: brandId, valid_to: null, deleted_at: null },
          select: { id: true },
        });
        if (ex) continue;
        await tx.supplier_component_prices.create({
          data: { ...audit, component_id: compId, supplier_id: supplierId, brand_id: brandId, price: o.price, currency: "INR", lead_time_days: o.leadTimeDays },
        });
        counts.prices++;
      }
    }

    // 4) PCBs (+ one Active revision each + BOM lines) -------------------------
    for (const pcb of pcbs) {
      let pcbId: string;
      const existing = await tx.pcbs.findFirst({ where: { company_id: companyId, slug: pcb.id, deleted_at: null }, select: { id: true } });
      if (existing) {
        pcbId = existing.id;
      } else {
        const row = await tx.pcbs.create({
          data: { ...audit, slug: pcb.id, name: pcb.name, description: pcb.description, layers: pcb.layers, status: pcb.status },
          select: { id: true },
        });
        pcbId = row.id; counts.pcbs++;
      }

      // Active revision "Rev A" (the mock holds only the current BOM)
      let revId: string;
      const rev = await tx.pcb_revisions.findFirst({ where: { company_id: companyId, pcb_id: pcbId, rev: "Rev A", deleted_at: null }, select: { id: true } });
      if (rev) {
        revId = rev.id;
      } else {
        const row = await tx.pcb_revisions.create({
          data: { ...audit, pcb_id: pcbId, rev: "Rev A", status: "Active" },
          select: { id: true },
        });
        revId = row.id; counts.pcbRevisions++;
      }
      pcbRevUuid.set(pcb.id, revId);

      // BOM lines
      for (const line of pcb.lines) {
        const compId = componentUuid.get(line.componentId);
        if (!compId) throw new Error(`Line component "${line.componentId}" was not seeded`);
        const ex = await tx.pcb_lines.findFirst({ where: { company_id: companyId, pcb_revision_id: revId, component_id: compId, deleted_at: null }, select: { id: true } });
        if (ex) continue;
        await tx.pcb_lines.create({
          data: {
            ...audit, pcb_revision_id: revId, component_id: compId, qty: line.qty,
            ref_des: line.refDes ?? null,
            preferred_brand_id: line.preferredBrandId ? (brandUuid.get(line.preferredBrandId) ?? null) : null,
            remarks: line.remarks ?? null,
          },
        });
        counts.pcbLines++;
      }
    }

    // 5) Product (+ Active BOM version + product_pcbs) ------------------------
    let productId: string;
    const existingProduct = await tx.products.findFirst({ where: { company_id: companyId, code: product.code, deleted_at: null }, select: { id: true } });
    if (existingProduct) {
      productId = existingProduct.id;
    } else {
      const row = await tx.products.create({
        data: { ...audit, slug: product.id, code: product.code, name: product.name, version: product.version, description: product.description, status: product.status, estimated_cost: product.estimatedCost },
        select: { id: true },
      });
      productId = row.id; counts.product++;
    }

    let bomId: string;
    const bom = await tx.bom_versions.findFirst({ where: { company_id: companyId, product_id: productId, version: product.version, deleted_at: null }, select: { id: true } });
    if (bom) {
      bomId = bom.id;
    } else {
      const row = await tx.bom_versions.create({
        data: { ...audit, product_id: productId, version: product.version, status: "Active" },
        select: { id: true },
      });
      bomId = row.id; counts.bomVersion++;
    }

    for (const ref of product.pcbs) {
      const revId = pcbRevUuid.get(ref.pcbId);
      if (!revId) throw new Error(`PCB revision for "${ref.pcbId}" missing`);
      const ex = await tx.product_pcbs.findFirst({ where: { company_id: companyId, bom_version_id: bomId, pcb_revision_id: revId, deleted_at: null }, select: { id: true } });
      if (ex) continue;
      await tx.product_pcbs.create({
        data: { ...audit, bom_version_id: bomId, pcb_revision_id: revId, qty: ref.qty, sequence: ref.sequence ?? null, remarks: ref.remarks ?? null },
      });
      counts.productPcbs++;
    }
  }, { timeout: 60_000 });

  console.log(`✅ Seeded "${product.name}" (${product.code}) graph into STACKIOT:`);
  console.table(counts);
  console.log("(counts are NEW rows created; existing rows were reused — re-run is idempotent)");
}

main()
  .catch((e) => {
    console.error("seed-sample error:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

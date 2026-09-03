/**
 * GET /api/bootstrap — the whole catalog in ONE payload, shaped as the catalog
 * `DataSet` (@/lib/catalog) so the client can bind the shared selector factory to
 * it. Reconstructs that shape from the normalized tables in business-key id-space
 * (slug / generic_pn), with live stock folded into each brand variant.
 */
import { withTenant } from "@/lib/prisma";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import type {
  DataSet,
  Brand,
  Supplier,
  Component,
  Pcb,
  Product,
  Spec,
  SolderType,
  ItemType,
  ItemCategory,
  PcbStatus,
  ProductStatus,
} from "@/lib/catalog";

export async function getBootstrap(): Promise<DataSet> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, "component.view");

    const [brandRows, supplierRows, compRows, variantRows, offerRows, pcbRows, lineRows, prodRows, ppRows, categoryRows] =
      await Promise.all([
        tx.$queryRaw<Brand[]>`
          SELECT slug AS id, name, COALESCE(description,'') AS description,
                 COALESCE(headquarter,'') AS headquarter, COALESCE(founded,'') AS founded,
                 status, COALESCE(rating,0)::float8 AS rating
          FROM brands WHERE deleted_at IS NULL ORDER BY name`,
        tx.$queryRaw<Supplier[]>`
          SELECT slug AS id, name, COALESCE(description,'') AS description, COALESCE(contact,'') AS contact,
                 COALESCE(email,'') AS email, COALESCE(phone,'') AS phone, COALESCE(address,'') AS address,
                 COALESCE(terms,'') AS terms, COALESCE(rating,0)::float8 AS rating, status
          FROM suppliers WHERE deleted_at IS NULL ORDER BY name`,
        // Universal-items projection. Post module-consolidation the legacy
        // `components` table is retired for freshly-imported tenants; the
        // universal `items` table is the sole source of truth. Legacy
        // fields the client `Component` shape still carries (category name,
        // annualConsumption) come back empty/zero — no consumer of
        // `d.COMPONENTS` should be relying on those anymore.
        tx.$queryRaw<{
          id: string; genericPN: string; name: string; category: string; description: string;
          unit: string; solderType: string | null; footprint: string; spq: number | null;
          minStock: number; reorderQty: number; annualConsumption: number; specs: Spec[];
          preferredSupplierId: string | null;
          categoryId: string | null; categoryPath: string | null; itemType: string;
        }[]>`
          SELECT COALESCE(NULLIF(i.generic_pn,''), i.id::text) AS id,
                 COALESCE(i.generic_pn,'') AS "genericPN",
                 i.name,
                 COALESCE((SELECT ic.name FROM item_categories ic WHERE ic.id = i.category_id), '') AS category,
                 COALESCE(i.description,'') AS description,
                 i.base_uom AS unit,
                 i.solder_type::text AS "solderType",
                 COALESCE(i.footprint,'') AS footprint,
                 i.spq,
                 i.min_stock::float8 AS "minStock",
                 i.reorder_qty::float8 AS "reorderQty",
                 0::float8 AS "annualConsumption",
                 COALESCE(i.specs, '[]'::jsonb) AS specs,
                 (SELECT s.slug FROM suppliers s WHERE s.id = i.default_supplier_id) AS "preferredSupplierId",
                 i.category_id AS "categoryId",
                 i.item_type::text AS "itemType",
                 (SELECT ic.path FROM item_categories ic WHERE ic.id = i.category_id) AS "categoryPath"
            FROM items i WHERE i.deleted_at IS NULL ORDER BY i.name`,
        // Variants: item_variants + inventory_balances keyed on item_variant_id
        // (the F2 slice added that column alongside the legacy
        // component_brand_variant_id). Brands still address the same rows.
        tx.$queryRaw<{ variantId: string; componentPN: string; brandId: string; partNo: string; stock: number }[]>`
          SELECT v.id AS "variantId",
                 COALESCE(NULLIF(i.generic_pn,''), i.id::text) AS "componentPN",
                 b.slug AS "brandId",
                 COALESCE(v.part_no,'') AS "partNo",
                 COALESCE(SUM(ib.on_hand),0)::float8 AS stock
            FROM item_variants v
            JOIN items i ON i.id = v.item_id AND i.deleted_at IS NULL
            JOIN brands b ON b.id = v.brand_id
       LEFT JOIN inventory_balances ib ON ib.item_variant_id = v.id AND ib.deleted_at IS NULL
           WHERE v.deleted_at IS NULL
           GROUP BY v.id, i.generic_pn, i.id, b.slug, v.part_no`,
        // Supplier offers still live in `supplier_component_prices` and its
        // FK targets `components(id)`. F2 mirrored the legacy component id
        // onto items.id, so the join works transparently for anything that
        // has a mirrored row; freshly-created items without a mirror row
        // simply carry no offers here — expected.
        tx.$queryRaw<{ componentPN: string; supplierId: string; brandId: string; price: number; leadTimeDays: number | null }[]>`
          SELECT COALESCE(NULLIF(i.generic_pn,''), i.id::text) AS "componentPN",
                 s.slug AS "supplierId",
                 b.slug AS "brandId",
                 scp.price::float8 AS price,
                 scp.lead_time_days AS "leadTimeDays"
            FROM supplier_component_prices scp
            JOIN items i ON i.id = scp.component_id AND i.deleted_at IS NULL
            JOIN suppliers s ON s.id = scp.supplier_id
            JOIN brands b ON b.id = scp.brand_id
           WHERE scp.valid_to IS NULL AND scp.deleted_at IS NULL`,
        tx.$queryRaw<{ id: string; name: string; description: string; layers: number | null; status: string }[]>`
          SELECT slug AS id, name, COALESCE(description,'') AS description, layers, status
          FROM pcbs WHERE deleted_at IS NULL ORDER BY name`,
        // D1: universal-BOM port. Every PCB's Active revision (=universal
        // item, since F2 mirrored pcb_revisions.id → items.id) has its
        // BOM in item_bom_versions/item_bom_lines. We key back to the PCB
        // slug via pcb_revisions → pcbs — legacy pcbs still owns the
        // "PCB parent + slug" concept; only the BOM lines live universally.
        tx.$queryRaw<{ pcbId: string; componentId: string; qty: number; refDes: string | null; preferredBrandId: string | null; remarks: string | null }[]>`
          SELECT pc.slug AS "pcbId",
                 COALESCE(NULLIF(c.generic_pn,''), c.id::text) AS "componentId",
                 bl.qty::int AS qty,
                 bl.ref_des AS "refDes",
                 b.slug AS "preferredBrandId",
                 bl.remarks
          FROM pcbs pc
          JOIN pcb_revisions pr ON pr.pcb_id = pc.id AND pr.status = 'Active' AND pr.deleted_at IS NULL
          JOIN item_bom_versions bv ON bv.parent_item_id = pr.id AND bv.status = 'Active' AND bv.deleted_at IS NULL
          JOIN item_bom_lines bl ON bl.bom_version_id = bv.id AND bl.deleted_at IS NULL
          JOIN components c ON c.id = bl.child_item_id
          LEFT JOIN brands b ON b.id = bl.preferred_brand_id
          WHERE pc.deleted_at IS NULL`,
        tx.$queryRaw<{ id: string; name: string; code: string; version: string; description: string; status: string; estimatedCost: number }[]>`
          SELECT slug AS id, name, code, COALESCE(version,'') AS version, COALESCE(description,'') AS description,
                 status, COALESCE(estimated_cost,0)::float8 AS "estimatedCost"
          FROM products WHERE deleted_at IS NULL ORDER BY name`,
        // D1: universal-BOM port. Product BOMs live in
        // item_bom_versions/item_bom_lines now (products.id === items.id via
        // F2). The client's `pcbsByProduct` builder only cares about PCB
        // children, so we filter child_item_id → pcb_revisions to keep parity
        // with the legacy shape (raw parts or sub-assemblies in a product BOM
        // — legal universally but not yet meaningful to the bootstrap client
        // consumer — are dropped from this projection).
        tx.$queryRaw<{ productId: string; pcbId: string; qty: number; sequence: number | null; remarks: string | null }[]>`
          SELECT p.slug AS "productId", pc.slug AS "pcbId", bl.qty::int AS qty, bl.sequence, bl.remarks
          FROM products p
          JOIN item_bom_versions bv ON bv.parent_item_id = p.id AND bv.status = 'Active' AND bv.deleted_at IS NULL
          JOIN item_bom_lines bl ON bl.bom_version_id = bv.id AND bl.deleted_at IS NULL
          JOIN pcb_revisions pr ON pr.id = bl.child_item_id
          JOIN pcbs pc ON pc.id = pr.pcb_id
          WHERE p.deleted_at IS NULL`,
        tx.$queryRaw<{ id: string; parentId: string | null; name: string; slug: string; path: string; defaultItemType: string | null; sortOrder: number }[]>`
          SELECT id, parent_id AS "parentId", name, slug, path,
                 default_item_type::text AS "defaultItemType", sort_order AS "sortOrder"
          FROM item_categories WHERE deleted_at IS NULL ORDER BY path`,
      ]);

    // group children by parent business key
    const variantsByComp = groupBy(variantRows, (v) => v.componentPN);
    const offersByComp = groupBy(offerRows, (o) => o.componentPN);
    const linesByPcb = groupBy(lineRows, (l) => l.pcbId);
    const pcbsByProduct = groupBy(ppRows, (r) => r.productId);

    const components: Component[] = compRows.map((c) => {
      const brandVariants = (variantsByComp.get(c.id) ?? []).map((v) => ({
        id: v.variantId, brandId: v.brandId, partNo: v.partNo, stock: v.stock,
      }));
      const offers = (offersByComp.get(c.id) ?? []).map((o) => ({
        supplierId: o.supplierId, brandId: o.brandId, price: o.price, leadTimeDays: o.leadTimeDays ?? 0,
      }));
      return {
        id: c.id, genericPN: c.genericPN, name: c.name, category: c.category, description: c.description,
        categoryId: c.categoryId, categoryPath: c.categoryPath,
        itemType: (c.itemType ?? "raw") as ItemType,
        stock: brandVariants.reduce((s, v) => s + v.stock, 0),
        minStock: c.minStock, reorderQty: c.reorderQty, unit: c.unit,
        bin: "", lastCount: "",
        solderType: (c.solderType ?? "SMD") as SolderType,
        footprint: c.footprint, spq: c.spq ?? 0, annualConsumption: c.annualConsumption,
        specs: Array.isArray(c.specs) ? c.specs : [],
        brandVariants, offers,
        preferredSupplierId: c.preferredSupplierId ?? undefined,
      };
    });

    const pcbs: Pcb[] = pcbRows.map((p) => {
      const lines = (linesByPcb.get(p.id) ?? []).map((l) => ({
        componentId: l.componentId, qty: l.qty,
        refDes: l.refDes ?? undefined,
        preferredBrandId: l.preferredBrandId ?? undefined,
        remarks: l.remarks ?? undefined,
      }));
      return {
        id: p.id, name: p.name, description: p.description, layers: p.layers ?? 0,
        status: p.status as PcbStatus, componentsCount: lines.length, stockCount: 0, lines,
      };
    });

    const products: Product[] = prodRows.map((p) => ({
      id: p.id, name: p.name, code: p.code, version: p.version, description: p.description,
      status: p.status as ProductStatus, estimatedCost: p.estimatedCost, buildableQty: 0,
      pcbs: (pcbsByProduct.get(p.id) ?? [])
        .map((r) => ({ pcbId: r.pcbId, qty: r.qty, sequence: r.sequence ?? undefined, remarks: r.remarks ?? undefined }))
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
    }));

    const itemCategories: ItemCategory[] = categoryRows.map((r) => ({
      id: r.id, parentId: r.parentId, name: r.name, slug: r.slug, path: r.path,
      defaultItemType: (r.defaultItemType ?? null) as ItemType | null, sortOrder: r.sortOrder,
    }));

    return { components, brands: brandRows, suppliers: supplierRows, pcbs, products, itemCategories };
  });
}

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

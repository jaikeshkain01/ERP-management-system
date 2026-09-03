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
  Spec,
  SolderType,
  ItemType,
  ItemCategory,
} from "@/lib/catalog";

export async function getBootstrap(): Promise<DataSet> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, "component.view");

    // PCBS and PRODUCTS projections were retired with the module-consolidation
    // slice: /pcb-management/list and /products/list now redirect to the
    // universal items list, and the server-side dashboard endpoint reads
    // straight from `items` (item_type='assembled'). The bootstrap payload
    // no longer carries either projection — client selectors return empty
    // arrays for `d.PCBS` / `d.PRODUCTS`, which is what a migrated tenant
    // was already seeing.
    const [brandRows, supplierRows, compRows, variantRows, offerRows, categoryRows] =
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
        tx.$queryRaw<{ id: string; parentId: string | null; name: string; slug: string; path: string; defaultItemType: string | null; sortOrder: number }[]>`
          SELECT id, parent_id AS "parentId", name, slug, path,
                 default_item_type::text AS "defaultItemType", sort_order AS "sortOrder"
          FROM item_categories WHERE deleted_at IS NULL ORDER BY path`,
      ]);

    // group children by parent business key
    const variantsByComp = groupBy(variantRows, (v) => v.componentPN);
    const offersByComp = groupBy(offerRows, (o) => o.componentPN);

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

    // pcbs and products are retired projections — every remaining consumer
    // either falls back to `d.COMPONENTS.filter(itemType === ...)` or reads
    // straight from `/api/items?itemType=...`. See the comment above the
    // Promise.all for the migration context.
    const pcbs: DataSet["pcbs"] = [];
    const products: DataSet["products"] = [];

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

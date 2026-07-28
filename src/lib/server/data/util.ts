/** Shared helpers for data providers. */

import type { TenantContext, TxClient } from "@/lib/prisma";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if `s` looks like a UUID (so we can match a DB PK vs a slug/code). */
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** Turn a display name into a url-safe, ≤60-char slug. */
export const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** Pick a slug free of collisions in `table` for this tenant (base, base-2, base-3, …). */
export async function uniqueSlug(tx: TxClient, table: "products" | "pcbs", base: string): Promise<string> {
  const root = base || "item";
  const rows =
    table === "products"
      ? await tx.$queryRaw<{ slug: string }[]>`
          SELECT slug FROM products WHERE deleted_at IS NULL AND (slug = ${root} OR slug LIKE ${root + "-%"})`
      : await tx.$queryRaw<{ slug: string }[]>`
          SELECT slug FROM pcbs WHERE deleted_at IS NULL AND (slug = ${root} OR slug LIKE ${root + "-%"})`;
  const taken = new Set(rows.map((r) => r.slug));
  let slug = root;
  let n = 2;
  while (taken.has(slug)) slug = `${root}-${n++}`;
  return slug;
}

/** A component line to resolve against the catalog or create on the fly. */
export interface ResolveComponentLine {
  /** generic_pn of an existing catalog component to link; absent → create a new one. */
  componentId?: string;
  name?: string;
  partNumber?: string;
  /** Maps to component.category. */
  type?: string;
  solderType?: "SMD" | "DIP";
  footprint?: string;
  qty: number;
  /** Reference designator(s) for this placement → pcb_lines.ref_des. */
  refDes?: string;
  /** Manufacturer / brand name → resolved to a brand, set as pcb_lines.preferred_brand_id. */
  manufacturer?: string;
  /** Supplier name → resolved to a supplier record (price link only when priced). */
  supplier?: string;
  /** Unit price for the supplier link; a link row is only created when this is > 0. */
  unitPrice?: number;
}

/** True if the line carries enough to link or create a component. */
export const lineHasContent = (l: ResolveComponentLine): boolean =>
  !!(l.componentId?.trim() || l.name?.trim() || l.partNumber?.trim());

/** Resolve a brand by name (case-insensitive), creating one if it doesn't exist. */
export async function resolveOrCreateBrand(
  tx: TxClient,
  ctx: TenantContext,
  name: string,
): Promise<string> {
  const existing = await tx.brands.findFirst({
    where: { deleted_at: null, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.brands.create({
    data: {
      company_id: ctx.companyId!,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      slug: slugify(name) || "brand",
      name,
      status: "Approved",
    },
    select: { id: true },
  });
  return created.id;
}

/** Resolve a supplier by name (case-insensitive), creating one if it doesn't exist. */
export async function resolveOrCreateSupplier(
  tx: TxClient,
  ctx: TenantContext,
  name: string,
): Promise<string> {
  const existing = await tx.suppliers.findFirst({
    where: { deleted_at: null, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.suppliers.create({
    data: {
      company_id: ctx.companyId!,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      slug: slugify(name) || "supplier",
      name,
      status: "Active",
    },
    select: { id: true },
  });
  return created.id;
}

/** Resolve a line to a component uuid: link an existing one (by generic_pn) or create it. */
export async function resolveOrCreateComponent(
  tx: TxClient,
  ctx: TenantContext,
  line: ResolveComponentLine,
): Promise<string> {
  const audit = { company_id: ctx.companyId!, created_by: ctx.userId, updated_by: ctx.userId };

  // Explicit link to an existing catalog component.
  const explicit = line.componentId?.trim();
  if (explicit) {
    const c = await tx.components.findFirst({ where: { generic_pn: explicit, deleted_at: null }, select: { id: true } });
    if (c) return c.id;
  }

  // A component's identity is its VALUE (name), not the "Part Number" column
  // alone. Supplier/customer BOMs routinely reuse ONE schematic-symbol part
  // number (e.g. "Res2_0603") across several distinct values (0E, 1K, 4.7K).
  // Keying purely on that part number collapsed those rows into a single line
  // with a summed qty and concatenated designators. So we derive a base key
  // from the part number (falling back to the value), but only ever LINK to an
  // existing component when the value matches too — a same-PN / different-value
  // line gets its own value-disambiguated generic_pn instead of merging.
  const value = line.name?.trim() ?? "";
  const baseKey = (line.partNumber?.trim() || explicit || slugify(value).toUpperCase()) || "PART";
  const valueSlug = slugify(value).toUpperCase() || "V";

  if (value) {
    // Same value already in the catalog under this key (or its disambiguated
    // form) → link to it (re-imports and cross-board reuse stay stable).
    const sameValue = await tx.components.findFirst({
      where: {
        deleted_at: null,
        name: { equals: value, mode: "insensitive" },
        generic_pn: { in: [baseKey, `${baseKey}-${valueSlug}`] },
      },
      select: { id: true },
    });
    if (sameValue) return sameValue.id;
  } else {
    // No value to distinguish on — dedupe on the raw key as before.
    const exact = await tx.components.findFirst({ where: { generic_pn: baseKey, deleted_at: null }, select: { id: true } });
    if (exact) return exact.id;
  }

  // Pick a free generic_pn: the base key when available, otherwise disambiguate
  // by value so a shared part number never forces two values onto one component.
  let genericPN = baseKey;
  const taken = await tx.components.findFirst({ where: { generic_pn: genericPN, deleted_at: null }, select: { id: true } });
  if (taken) {
    genericPN = `${baseKey}-${valueSlug}`;
    let n = 2;
    while (await tx.components.findFirst({ where: { generic_pn: genericPN, deleted_at: null }, select: { id: true } })) {
      genericPN = `${baseKey}-${valueSlug}-${n++}`;
    }
  }

  const created = await tx.components.create({
    data: {
      ...audit,
      generic_pn: genericPN,
      name: value || genericPN,
      category: line.type?.trim() || null,
      unit: "PCS",
      solder_type: line.solderType ?? null,
      footprint: line.footprint?.trim() || null,
      min_stock: 0,
      reorder_qty: 0,
      annual_consumption: 0,
      specs: [],
    },
    select: { id: true },
  });
  return created.id;
}

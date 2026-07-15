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
}

/** True if the line carries enough to link or create a component. */
export const lineHasContent = (l: ResolveComponentLine): boolean =>
  !!(l.componentId?.trim() || l.name?.trim() || l.partNumber?.trim());

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

  // Otherwise derive a stable generic_pn and dedupe by it (re-typing an existing
  // part links to it instead of creating a duplicate).
  const genericPN = (line.partNumber?.trim() || explicit || slugify(line.name ?? "").toUpperCase()) || "PART";
  const dupe = await tx.components.findFirst({ where: { generic_pn: genericPN, deleted_at: null }, select: { id: true } });
  if (dupe) return dupe.id;

  const created = await tx.components.create({
    data: {
      ...audit,
      generic_pn: genericPN,
      name: line.name?.trim() || genericPN,
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

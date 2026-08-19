/**
 * Item categories (Postgres) — the tenant-scoped category TREE introduced in
 * Phase 2A. Accessed via raw SQL because `item_categories` is a post-baseline
 * table not present in the generated Prisma client (same convention as
 * `preferred_supplier_id` / custom_products). Guarded by the component perms —
 * categories are part of the item master.
 */
import { Prisma } from "@/generated/prisma/client";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";

export interface ItemCategoryView {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  defaultItemType: string | null;
  sortOrder: number;
}

const ITEM_TYPES = new Set(["raw", "semi_assembled", "assembled", "consumable", "asset", "packaging"]);
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

const SELECT_COLS = `id, parent_id AS "parentId", name, slug, path,
  default_item_type::text AS "defaultItemType", sort_order AS "sortOrder"`;

export async function listItemCategories(): Promise<ItemCategoryView[]> {
  return guarded("component.view", async (tx) => {
    return tx.$queryRawUnsafe<ItemCategoryView[]>(
      `SELECT ${SELECT_COLS} FROM item_categories WHERE deleted_at IS NULL ORDER BY path`,
    );
  });
}

export interface CreateItemCategoryInput {
  name: string;
  parentId?: string | null;
  defaultItemType?: string | null;
}

/** Create a category node. `path` is derived from the parent's path + this slug. */
export async function createItemCategory(input: CreateItemCategoryInput): Promise<ItemCategoryView> {
  return guarded("component.edit", async (tx, ctx) => {
    const name = input.name.trim();
    if (!name) throw Errors.badRequest("Category name is required");
    const slug = slugify(name);
    if (!slug) throw Errors.badRequest("Category name must contain letters or digits");

    const defaultItemType = input.defaultItemType ?? null;
    if (defaultItemType && !ITEM_TYPES.has(defaultItemType)) {
      throw Errors.badRequest("Invalid item type", { defaultItemType });
    }

    let parentPath: string | null = null;
    if (input.parentId) {
      const parent = await tx.$queryRaw<{ path: string }[]>`
        SELECT path FROM item_categories WHERE id = ${input.parentId}::uuid AND deleted_at IS NULL`;
      if (!parent[0]) throw Errors.notFound("Parent category");
      parentPath = parent[0].path;
    }
    const path = parentPath ? `${parentPath}/${slug}` : slug;

    const dupe = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM item_categories
      WHERE company_id = ${ctx.companyId!}::uuid AND path = ${path} AND deleted_at IS NULL`;
    if (dupe[0]) throw Errors.conflict("A category with this path already exists", { path });

    const rows = await tx.$queryRaw<ItemCategoryView[]>`
      INSERT INTO item_categories (company_id, parent_id, name, slug, path, default_item_type, created_by, updated_by)
      VALUES (${ctx.companyId!}::uuid, ${input.parentId ?? null}::uuid, ${name}, ${slug}, ${path},
              ${defaultItemType}::item_type, ${ctx.userId}::uuid, ${ctx.userId}::uuid)
      RETURNING id, parent_id AS "parentId", name, slug, path,
                default_item_type::text AS "defaultItemType", sort_order AS "sortOrder"`;
    return rows[0];
  });
}

// ── update ─────────────────────────────────────────────────────────────────
export interface UpdateItemCategoryInput {
  name?: string;
  /** New parent uuid, or null to move to a root. Omit to leave in place. */
  parentId?: string | null;
  defaultItemType?: string | null;
}

interface CatRow {
  id: string;
  parentId: string | null;
  slug: string;
  path: string;
}

/**
 * Rename and/or re-parent a category. When the slug or parent changes, `path` is
 * recomputed for the node AND every descendant (materialised-path prefix swap).
 * Re-parenting under the node's own subtree is rejected (would create a cycle).
 */
export async function updateItemCategory(id: string, patch: UpdateItemCategoryInput): Promise<ItemCategoryView> {
  return guarded("component.edit", async (tx, ctx) => {
    if (!isUuid(id)) throw Errors.notFound("Category");
    const cur = await tx.$queryRaw<CatRow[]>`
      SELECT id, parent_id AS "parentId", slug, path FROM item_categories
      WHERE id = ${id}::uuid AND deleted_at IS NULL`;
    if (!cur[0]) throw Errors.notFound("Category");
    const node = cur[0];

    if (patch.defaultItemType != null && !ITEM_TYPES.has(patch.defaultItemType)) {
      throw Errors.badRequest("Invalid item type", { defaultItemType: patch.defaultItemType });
    }

    // Resolve the (possibly new) slug and parent path.
    let slug = node.slug;
    let name: string | undefined;
    if (patch.name !== undefined) {
      name = patch.name.trim();
      if (!name) throw Errors.badRequest("Category name is required");
      slug = slugify(name);
      if (!slug) throw Errors.badRequest("Category name must contain letters or digits");
    }

    let newParentId = node.parentId;
    let parentPath: string | null = null;
    if (patch.parentId !== undefined) {
      if (patch.parentId === id) throw Errors.badRequest("A category cannot be its own parent");
      if (patch.parentId) {
        const parent = await tx.$queryRaw<{ path: string }[]>`
          SELECT path FROM item_categories WHERE id = ${patch.parentId}::uuid AND deleted_at IS NULL`;
        if (!parent[0]) throw Errors.notFound("Parent category");
        // Reject moving a node under its own subtree (cycle).
        if (parent[0].path === node.path || parent[0].path.startsWith(`${node.path}/`)) {
          throw Errors.badRequest("Cannot move a category under its own descendant");
        }
        parentPath = parent[0].path;
      }
      newParentId = patch.parentId;
    } else if (node.parentId) {
      const parent = await tx.$queryRaw<{ path: string }[]>`
        SELECT path FROM item_categories WHERE id = ${node.parentId}::uuid AND deleted_at IS NULL`;
      parentPath = parent[0]?.path ?? null;
    }

    const newPath = parentPath ? `${parentPath}/${slug}` : slug;

    if (newPath !== node.path) {
      const dupe = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM item_categories
        WHERE company_id = ${ctx.companyId!}::uuid AND path = ${newPath} AND deleted_at IS NULL AND id <> ${id}::uuid
        LIMIT 1`;
      if (dupe[0]) throw Errors.conflict("A category with this path already exists", { path: newPath });

      // Re-path descendants first (swap the old prefix for the new one), then the node.
      await tx.$executeRaw`
        UPDATE item_categories
        SET path = ${newPath} || substring(path FROM ${node.path.length + 1}::int),
            updated_by = ${ctx.userId}::uuid, updated_at = now()
        WHERE company_id = ${ctx.companyId!}::uuid AND deleted_at IS NULL
          AND path LIKE ${`${node.path}/%`}`;
    }

    const set: Prisma.Sql[] = [Prisma.sql`updated_by = ${ctx.userId}::uuid`, Prisma.sql`updated_at = now()`];
    if (name !== undefined) set.push(Prisma.sql`name = ${name}`, Prisma.sql`slug = ${slug}`);
    if (patch.parentId !== undefined) set.push(Prisma.sql`parent_id = ${newParentId}::uuid`);
    if (newPath !== node.path) set.push(Prisma.sql`path = ${newPath}`);
    if (patch.defaultItemType !== undefined) set.push(Prisma.sql`default_item_type = ${patch.defaultItemType}::item_type`);

    const rows = await tx.$queryRaw<ItemCategoryView[]>(Prisma.sql`
      UPDATE item_categories SET ${Prisma.join(set, ", ")} WHERE id = ${id}::uuid
      RETURNING id, parent_id AS "parentId", name, slug, path,
                default_item_type::text AS "defaultItemType", sort_order AS "sortOrder"`);
    return rows[0];
  });
}

// ── delete ─────────────────────────────────────────────────────────────────
/** Soft-delete a leaf category. Blocked if it has live children or any items assigned. */
export async function deleteItemCategory(id: string): Promise<{ id: string; path: string }> {
  return guarded("component.edit", async (tx, ctx) => {
    if (!isUuid(id)) throw Errors.notFound("Category");
    const cur = await tx.$queryRaw<{ id: string; path: string }[]>`
      SELECT id, path FROM item_categories WHERE id = ${id}::uuid AND deleted_at IS NULL`;
    if (!cur[0]) throw Errors.notFound("Category");

    const kids = await tx.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM item_categories WHERE parent_id = ${id}::uuid AND deleted_at IS NULL LIMIT 1`;
    if (kids.length) throw Errors.conflict(
      "Category has sub-categories and cannot be deleted",
      undefined,
      "Delete the sub-categories (or move them to another parent) first — the tree must be a leaf to delete.",
    );

    const items = await tx.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM components WHERE category_id = ${id}::uuid AND deleted_at IS NULL LIMIT 1`;
    if (items.length) throw Errors.conflict(
      "Category has items assigned and cannot be deleted",
      undefined,
      "Re-assign each item on the Items list to a different category, then retry.",
    );

    await tx.$executeRaw`
      UPDATE item_categories SET deleted_at = now(), updated_by = ${ctx.userId}::uuid WHERE id = ${id}::uuid`;
    return { id: cur[0].id, path: cur[0].path };
  });
}

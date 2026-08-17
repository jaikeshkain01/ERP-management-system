/**
 * Warehouses + storage-location tree (DB). Full CRUD; the location tree is a
 * self-referencing Warehouse → Zone → Rack → Bin hierarchy (see schema.sql).
 */
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";

const LOCATION_KINDS = ["zone", "rack", "bin"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export interface WarehouseView {
  id: string;
  code: string;
  name: string;
  location: string | null;
  isFinishedGoods: boolean;
}

export interface LocationView {
  id: string;
  warehouseId: string;
  parentId: string | null;
  kind: string;
  code: string;
  name: string | null;
  isDefault: boolean;
}

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

export async function listWarehouses(): Promise<WarehouseView[]> {
  return guarded("warehouse.view", async (tx) => {
    const rows = await tx.warehouses.findMany({ where: { deleted_at: null }, orderBy: { code: "asc" } });
    return rows.map((w) => ({
      id: w.id, code: w.code, name: w.name, location: w.location, isFinishedGoods: w.is_finished_goods,
    }));
  });
}

export async function getWarehouseLocations(idOrCode: string): Promise<LocationView[]> {
  return guarded("warehouse.view", async (tx) => {
    const wh = await tx.warehouses.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrCode) ? { id: idOrCode } : { code: idOrCode }) },
      select: { id: true },
    });
    if (!wh) throw Errors.notFound("Warehouse");
    const rows = await tx.storage_locations.findMany({
      where: { warehouse_id: wh.id, deleted_at: null },
      orderBy: [{ kind: "asc" }, { code: "asc" }],
    });
    return rows.map(locFromDb);
  });
}

export async function getWarehouse(idOrCode: string): Promise<WarehouseView> {
  return guarded("warehouse.view", async (tx) => {
    const row = await tx.warehouses.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrCode) ? { id: idOrCode } : { code: idOrCode }) },
    });
    if (!row) throw Errors.notFound("Warehouse");
    return whFromDb(row);
  });
}

// ── warehouse writes ─────────────────────────────────────────────────────────
export interface CreateWarehouseInput {
  code: string;
  name: string;
  location?: string | null;
  isFinishedGoods?: boolean;
}

/** Create a warehouse. `code` is unique per tenant among live rows. */
export async function createWarehouse(input: CreateWarehouseInput): Promise<WarehouseView> {
  return guarded("warehouse.create", async (tx, ctx) => {
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code) throw Errors.badRequest("Warehouse code is required");
    if (!name) throw Errors.badRequest("Warehouse name is required");
    const dupe = await tx.warehouses.findFirst({ where: { code, deleted_at: null }, select: { id: true } });
    if (dupe) throw Errors.conflict("A warehouse with this code already exists", { code });
    const row = await tx.warehouses.create({
      data: {
        company_id: ctx.companyId!, created_by: ctx.userId, updated_by: ctx.userId,
        code, name,
        location: input.location?.trim() || null,
        is_finished_goods: input.isFinishedGoods ?? false,
      },
    });
    return whFromDb(row);
  });
}

export interface UpdateWarehouseInput {
  code?: string;
  name?: string;
  location?: string | null;
  isFinishedGoods?: boolean;
}

/** Edit a warehouse's own fields (by uuid or code). */
export async function updateWarehouse(idOrCode: string, patch: UpdateWarehouseInput): Promise<WarehouseView> {
  return guarded("warehouse.edit", async (tx, ctx) => {
    const existing = await tx.warehouses.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrCode) ? { id: idOrCode } : { code: idOrCode }) },
      select: { id: true, code: true },
    });
    if (!existing) throw Errors.notFound("Warehouse");
    if (patch.code !== undefined) {
      const code = patch.code.trim();
      if (!code) throw Errors.badRequest("Warehouse code cannot be empty");
      if (code !== existing.code) {
        const dupe = await tx.warehouses.findFirst({ where: { code, deleted_at: null, id: { not: existing.id } }, select: { id: true } });
        if (dupe) throw Errors.conflict("A warehouse with this code already exists", { code });
      }
    }
    const row = await tx.warehouses.update({
      where: { id: existing.id },
      data: {
        updated_by: ctx.userId, updated_at: new Date(),
        ...(patch.code !== undefined ? { code: patch.code.trim() } : {}),
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.location !== undefined ? { location: patch.location?.trim() || null } : {}),
        ...(patch.isFinishedGoods !== undefined ? { is_finished_goods: patch.isFinishedGoods } : {}),
      },
    });
    return whFromDb(row);
  });
}

/**
 * Soft-delete a warehouse (by uuid or code). Blocked if any of its locations
 * still hold stock; its (empty) locations are soft-deleted alongside.
 */
export async function deleteWarehouse(idOrCode: string): Promise<{ id: string; code: string }> {
  return guarded("warehouse.delete", async (tx, ctx) => {
    const wh = await tx.warehouses.findFirst({
      where: { deleted_at: null, ...(isUuid(idOrCode) ? { id: idOrCode } : { code: idOrCode }) },
      select: { id: true, code: true },
    });
    if (!wh) throw Errors.notFound("Warehouse");
    const stocked = await tx.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM inventory_balances
      WHERE warehouse_id = ${wh.id}::uuid AND on_hand <> 0 AND deleted_at IS NULL LIMIT 1`;
    if (stocked.length) throw Errors.conflict("Warehouse still holds stock and cannot be deleted");
    await tx.$executeRaw`
      UPDATE storage_locations SET deleted_at = now(), updated_by = ${ctx.userId}::uuid
      WHERE warehouse_id = ${wh.id}::uuid AND deleted_at IS NULL`;
    await tx.warehouses.update({ where: { id: wh.id }, data: { deleted_at: new Date(), updated_by: ctx.userId } });
    return { id: wh.id, code: wh.code };
  });
}

// ── location (bin) writes ─────────────────────────────────────────────────────
export interface CreateLocationInput {
  kind: LocationKind;
  code: string;
  name?: string | null;
  parentId?: string | null;
  isDefault?: boolean;
}

/** Resolve a warehouse to its id (uuid or code), or throw 404. */
async function resolveWarehouseId(tx: TxClient, idOrCode: string): Promise<string> {
  const wh = await tx.warehouses.findFirst({
    where: { deleted_at: null, ...(isUuid(idOrCode) ? { id: idOrCode } : { code: idOrCode }) },
    select: { id: true },
  });
  if (!wh) throw Errors.notFound("Warehouse");
  return wh.id;
}

/** Add a location (zone/rack/bin) to a warehouse. `code` is unique within it. */
export async function createLocation(warehouseIdOrCode: string, input: CreateLocationInput): Promise<LocationView> {
  return guarded("warehouse.create", async (tx, ctx) => {
    if (!LOCATION_KINDS.includes(input.kind)) throw Errors.badRequest("Invalid location kind", { kind: input.kind });
    const warehouseId = await resolveWarehouseId(tx, warehouseIdOrCode);
    const code = input.code.trim();
    if (!code) throw Errors.badRequest("Location code is required");

    // Parent (if any) must live in the same warehouse.
    if (input.parentId) {
      const parent = await tx.storage_locations.findFirst({
        where: { id: input.parentId, warehouse_id: warehouseId, deleted_at: null },
        select: { id: true },
      });
      if (!parent) throw Errors.badRequest("Parent location must be in the same warehouse");
    }
    const dupe = await tx.storage_locations.findFirst({
      where: { warehouse_id: warehouseId, code, deleted_at: null },
      select: { id: true },
    });
    if (dupe) throw Errors.conflict("A location with this code already exists in the warehouse", { code });
    // At most one default bin per warehouse.
    if (input.isDefault && input.kind === "bin") {
      const existingDefault = await tx.storage_locations.findFirst({
        where: { warehouse_id: warehouseId, is_default: true, kind: "bin", deleted_at: null },
        select: { id: true },
      });
      if (existingDefault) throw Errors.conflict("This warehouse already has a default bin");
    }
    const row = await tx.storage_locations.create({
      data: {
        company_id: ctx.companyId!, created_by: ctx.userId, updated_by: ctx.userId,
        warehouse_id: warehouseId, parent_id: input.parentId ?? null,
        kind: input.kind, code, name: input.name?.trim() || null,
        is_default: (input.isDefault ?? false) && input.kind === "bin",
      },
    });
    return locFromDb(row);
  });
}

export interface UpdateLocationInput {
  code?: string;
  name?: string | null;
  parentId?: string | null;
  isDefault?: boolean;
}

/** Edit a location's fields. Kind is immutable (stock/refs depend on it). */
export async function updateLocation(warehouseIdOrCode: string, locId: string, patch: UpdateLocationInput): Promise<LocationView> {
  return guarded("warehouse.edit", async (tx, ctx) => {
    if (!isUuid(locId)) throw Errors.notFound("Location");
    const warehouseId = await resolveWarehouseId(tx, warehouseIdOrCode);
    const existing = await tx.storage_locations.findFirst({
      where: { id: locId, warehouse_id: warehouseId, deleted_at: null },
      select: { id: true, code: true, kind: true },
    });
    if (!existing) throw Errors.notFound("Location");

    if (patch.code !== undefined) {
      const code = patch.code.trim();
      if (!code) throw Errors.badRequest("Location code cannot be empty");
      if (code !== existing.code) {
        const dupe = await tx.storage_locations.findFirst({
          where: { warehouse_id: warehouseId, code, deleted_at: null, id: { not: locId } },
          select: { id: true },
        });
        if (dupe) throw Errors.conflict("A location with this code already exists in the warehouse", { code });
      }
    }
    if (patch.parentId !== undefined && patch.parentId) {
      if (patch.parentId === locId) throw Errors.badRequest("A location cannot be its own parent");
      const parent = await tx.storage_locations.findFirst({
        where: { id: patch.parentId, warehouse_id: warehouseId, deleted_at: null },
        select: { id: true },
      });
      if (!parent) throw Errors.badRequest("Parent location must be in the same warehouse");
    }
    if (patch.isDefault && existing.kind === "bin") {
      const existingDefault = await tx.storage_locations.findFirst({
        where: { warehouse_id: warehouseId, is_default: true, kind: "bin", deleted_at: null, id: { not: locId } },
        select: { id: true },
      });
      if (existingDefault) throw Errors.conflict("This warehouse already has a default bin");
    }
    const row = await tx.storage_locations.update({
      where: { id: locId },
      data: {
        updated_by: ctx.userId, updated_at: new Date(),
        ...(patch.code !== undefined ? { code: patch.code.trim() } : {}),
        ...(patch.name !== undefined ? { name: patch.name?.trim() || null } : {}),
        ...(patch.parentId !== undefined ? { parent_id: patch.parentId ?? null } : {}),
        ...(patch.isDefault !== undefined ? { is_default: patch.isDefault && existing.kind === "bin" } : {}),
      },
    });
    return locFromDb(row);
  });
}

/** Soft-delete a location. Blocked if it has live children or holds stock. */
export async function deleteLocation(warehouseIdOrCode: string, locId: string): Promise<{ id: string; code: string }> {
  return guarded("warehouse.delete", async (tx, ctx) => {
    if (!isUuid(locId)) throw Errors.notFound("Location");
    const warehouseId = await resolveWarehouseId(tx, warehouseIdOrCode);
    const existing = await tx.storage_locations.findFirst({
      where: { id: locId, warehouse_id: warehouseId, deleted_at: null },
      select: { id: true, code: true },
    });
    if (!existing) throw Errors.notFound("Location");

    const child = await tx.storage_locations.findFirst({
      where: { parent_id: locId, deleted_at: null }, select: { id: true },
    });
    if (child) throw Errors.conflict("Location has child locations and cannot be deleted");

    const stocked = await tx.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM inventory_balances
      WHERE location_id = ${locId}::uuid AND on_hand <> 0 AND deleted_at IS NULL LIMIT 1`;
    if (stocked.length) throw Errors.conflict("Location still holds stock and cannot be deleted");

    await tx.storage_locations.update({ where: { id: locId }, data: { deleted_at: new Date(), updated_by: ctx.userId } });
    return { id: existing.id, code: existing.code };
  });
}

// ── mappers ────────────────────────────────────────────────────────────────
function whFromDb(w: { id: string; code: string; name: string; location: string | null; is_finished_goods: boolean }): WarehouseView {
  return { id: w.id, code: w.code, name: w.name, location: w.location, isFinishedGoods: w.is_finished_goods };
}

function locFromDb(l: { id: string; warehouse_id: string; parent_id: string | null; kind: string; code: string; name: string | null; is_default: boolean }): LocationView {
  return { id: l.id, warehouseId: l.warehouse_id, parentId: l.parent_id, kind: l.kind, code: l.code, name: l.name, isDefault: l.is_default };
}

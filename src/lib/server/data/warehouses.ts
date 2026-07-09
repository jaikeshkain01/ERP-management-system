/**
 * Warehouses + storage-location tree (mock/DB). Reads only for now
 * (location CRUD deferred). Mock mode returns a single synthetic warehouse/bin.
 */
import { isTesting } from "@/lib/config";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";
import { isUuid } from "@/lib/server/data/util";
import { MOCK_BIN, MOCK_WAREHOUSE } from "@/lib/server/mock";

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
  if (isTesting) return [MOCK_WAREHOUSE];
  return guarded("warehouse.view", async (tx) => {
    const rows = await tx.warehouses.findMany({ where: { deleted_at: null }, orderBy: { code: "asc" } });
    return rows.map((w) => ({
      id: w.id, code: w.code, name: w.name, location: w.location, isFinishedGoods: w.is_finished_goods,
    }));
  });
}

export async function getWarehouseLocations(idOrCode: string): Promise<LocationView[]> {
  if (isTesting) {
    if (idOrCode !== MOCK_WAREHOUSE.id && idOrCode !== MOCK_WAREHOUSE.code) throw Errors.notFound("Warehouse");
    return [{ ...MOCK_BIN }];
  }
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
    return rows.map((l) => ({
      id: l.id, warehouseId: l.warehouse_id, parentId: l.parent_id, kind: l.kind, code: l.code,
      name: l.name, isDefault: l.is_default,
    }));
  });
}

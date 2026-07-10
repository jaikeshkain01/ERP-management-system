/**
 * Module-licensing data access — per-tenant enable/disable state for the paid
 * modules (registry lives in code: src/lib/modules.ts). Persists what used to be
 * a localStorage toggle. An absent row means the module is enabled (default on).
 */
import { isTesting } from "@/lib/config";
import { withTenant, type TenantContext, type TxClient } from "@/lib/prisma";
import { ApiError } from "@/lib/server/http";
import { assertPermission } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";

// Kept in sync with ModuleId in src/lib/modules.ts (small, fixed set).
export const MODULE_IDS = ["inventory", "bom", "purchasing", "production", "reports"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];
export type ModuleMap = Record<ModuleId, boolean>;

const allEnabled = (): ModuleMap =>
  Object.fromEntries(MODULE_IDS.map((id) => [id, true])) as ModuleMap;

async function withSession<T>(fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, (tx) => fn(tx, ctx));
}

/** Current enable map for the active company (defaults every module to on). */
export async function getModules(): Promise<ModuleMap> {
  if (isTesting) return allEnabled();
  return withSession(async (tx) => {
    const rows = await tx.$queryRaw<{ module_id: string; enabled: boolean }[]>`
      SELECT module_id, enabled FROM company_modules WHERE deleted_at IS NULL`;
    const map = allEnabled();
    for (const r of rows) {
      if ((MODULE_IDS as readonly string[]).includes(r.module_id)) map[r.module_id as ModuleId] = r.enabled;
    }
    return map;
  });
}

/** Set one module's enabled flag (upsert) and return the full updated map. */
export async function setModule(id: ModuleId, enabled: boolean): Promise<ModuleMap> {
  if (isTesting) throw new ApiError(400, "mock_read_only", "Module writes are not available in mock mode (isTesting=true).");
  return withSession(async (tx, ctx) => {
    await assertPermission(tx, ctx, "role.edit");
    await tx.$executeRaw`
      INSERT INTO company_modules (company_id, created_by, updated_by, module_id, enabled)
      VALUES (${ctx.companyId}::uuid, ${ctx.userId}::uuid, ${ctx.userId}::uuid, ${id}, ${enabled})
      ON CONFLICT (company_id, module_id) WHERE deleted_at IS NULL
      DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`;
    const rows = await tx.$queryRaw<{ module_id: string; enabled: boolean }[]>`
      SELECT module_id, enabled FROM company_modules WHERE deleted_at IS NULL`;
    const map = allEnabled();
    for (const r of rows) {
      if ((MODULE_IDS as readonly string[]).includes(r.module_id)) map[r.module_id as ModuleId] = r.enabled;
    }
    return map;
  });
}

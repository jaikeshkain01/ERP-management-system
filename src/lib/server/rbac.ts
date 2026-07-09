/**
 * Role-based access control. A user's effective permissions in the ACTIVE company
 * are the (resource, action) grants on the role pinned by their membership
 * (company_memberships.role_id → role_permissions). Must run inside a `withTenant`
 * transaction so RLS scopes both tables to the active company.
 */
import type { TenantContext, TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";

/** The caller's effective permission strings (`"resource.action"`) as a Set. */
export async function getEffectivePermissions(
  tx: TxClient,
  ctx: TenantContext,
): Promise<Set<string>> {
  const membership = await tx.company_memberships.findFirst({
    where: { user_id: ctx.userId, company_id: ctx.companyId, deleted_at: null },
    select: { role_id: true },
  });
  if (!membership?.role_id) return new Set();

  const grants = await tx.role_permissions.findMany({
    where: { role_id: membership.role_id },
    select: { resource: true, action: true },
  });
  return new Set(grants.map((g) => `${g.resource}.${g.action}`));
}

/**
 * Throw 403 unless the caller holds `permission` (e.g. "component.view") in the
 * active company. Pass a pre-fetched permission set to avoid re-querying.
 */
export async function assertPermission(
  tx: TxClient,
  ctx: TenantContext,
  permission: string,
  preloaded?: Set<string>,
): Promise<void> {
  const perms = preloaded ?? (await getEffectivePermissions(tx, ctx));
  if (!perms.has(permission)) throw Errors.forbidden(permission);
}

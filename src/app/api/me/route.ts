/**
 * GET /api/me — the authenticated user, the active company, and the caller's
 * effective permissions in that company. The client uses `permissions` to
 * hide/disable actions the role can't perform (stacks with module licensing).
 */
import { prisma, withTenant } from "@/lib/prisma";
import { Errors, handle, ok } from "@/lib/server/http";
import { getEffectivePermissions } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const ctx = await requireSession();

    // users is global; read the identity directly.
    const user = await prisma.users.findFirst({
      where: { id: ctx.userId, deleted_at: null },
      select: { id: true, name: true, email: true, is_superadmin: true },
    });
    if (!user) throw Errors.unauthorized();

    const { company, permissions, roleName } = await withTenant(ctx, async (tx) => {
      const company = await tx.companies.findFirst({
        where: { id: ctx.companyId },
        select: { id: true, code: true, name: true },
      });
      const membership = await tx.company_memberships.findFirst({
        where: { user_id: ctx.userId, company_id: ctx.companyId, deleted_at: null },
        select: { roles: { select: { name: true } } },
      });
      const perms = await getEffectivePermissions(tx, ctx);
      return { company, permissions: [...perms].sort(), roleName: membership?.roles?.name };
    });

    if (!company) throw Errors.forbidden("Active company not accessible");

    return ok({ user, company, permissions, roleName });
  });
}

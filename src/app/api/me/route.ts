/**
 * GET /api/me — the authenticated user, the active company, and the caller's
 * effective permissions in that company. The client uses `permissions` to
 * hide/disable actions the role can't perform (stacks with module licensing).
 */
import { isTesting } from "@/lib/config";
import { prisma, withTenant } from "@/lib/prisma";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { Errors, handle, ok } from "@/lib/server/http";
import { MOCK_COMPANY, MOCK_USER } from "@/lib/server/mock";
import { getEffectivePermissions } from "@/lib/server/rbac";
import { requireSession } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const ctx = await requireSession();

    // FULL MOCK MODE: fixed admin with every permission granted.
    if (isTesting) {
      return ok({ user: MOCK_USER, company: MOCK_COMPANY, permissions: [...ALL_PERMISSIONS].sort() });
    }

    // users is global; read the identity directly.
    const user = await prisma.users.findFirst({
      where: { id: ctx.userId, deleted_at: null },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw Errors.unauthorized();

    const { company, permissions } = await withTenant(ctx, async (tx) => {
      const company = await tx.companies.findFirst({
        where: { id: ctx.companyId },
        select: { id: true, code: true, name: true },
      });
      const perms = await getEffectivePermissions(tx, ctx);
      return { company, permissions: [...perms].sort() };
    });

    if (!company) throw Errors.forbidden("Active company not accessible");

    return ok({ user, company, permissions });
  });
}

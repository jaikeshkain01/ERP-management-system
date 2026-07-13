/**
 * POST /api/auth/dev-login — DEV ONLY. Establishes a session as the seeded admin
 * with no credentials, so the UI can run against the DB without a login screen.
 * Disabled in production (returns 403); replace with the real login flow there.
 */
import { prisma, withUser } from "@/lib/prisma";
import { Errors, handle, ok } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    if (process.env.NODE_ENV === "production") {
      throw Errors.forbidden("dev-login is disabled in production");
    }

    const user = await prisma.users.findFirst({
      where: { is_active: true, deleted_at: null },
      orderBy: { created_at: "asc" },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw Errors.notFound("No user to sign in as");

    const company = await withUser(user.id, async (tx) => {
      const m = await tx.company_memberships.findFirst({
        where: { user_id: user.id, status: "active", deleted_at: null },
        orderBy: { is_default: "desc" },
        select: { company_id: true },
      });
      if (!m) return null;
      return tx.companies.findFirst({ where: { id: m.company_id }, select: { id: true, code: true, name: true } });
    });
    if (!company) throw Errors.forbidden("User has no active company");

    await setSessionCookie({ userId: user.id, companyId: company.id });
    return ok({ user, company });
  });
}

/**
 * POST /api/session/company  { companyId } — switch the ACTIVE company.
 *   - Normal user: must be an active member of the target company.
 *   - Superadmin: may open ANY company (operator mode) — no membership required.
 * Re-issues the session cookie with the new company id and returns it.
 *
 * DELETE /api/session/company — superadmin only: clear the active company and
 * return to the console (companyId = null). Normal users always have a company.
 */
import { z } from "zod";
import { prisma, withUser } from "@/lib/prisma";
import { Errors, handle, ok, parseJson } from "@/lib/server/http";
import { requireSession, setSessionCookie } from "@/lib/server/session";
import { withSuperadmin } from "@/lib/server/superadmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ companyId: z.string().uuid() });

async function isSuperadmin(userId: string): Promise<boolean> {
  const u = await prisma.users.findFirst({
    where: { id: userId, deleted_at: null, is_active: true },
    select: { is_superadmin: true },
  });
  return !!u?.is_superadmin;
}

export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireSession();
    const { companyId } = await parseJson(req, Body);

    if (await isSuperadmin(ctx.userId)) {
      // Superadmin can open any tenant — cross-tenant read confirms it exists.
      const company = await withSuperadmin(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; code: string; name: string }[]>`
          SELECT id, code, name FROM companies WHERE id = ${companyId}::uuid AND deleted_at IS NULL LIMIT 1`;
        return rows[0] ?? null;
      });
      if (!company) throw Errors.notFound("Company");
      await setSessionCookie({ userId: ctx.userId, companyId: company.id });
      return ok({ company });
    }

    const company = await withUser(ctx.userId, async (tx) => {
      const membership = await tx.company_memberships.findFirst({
        where: { user_id: ctx.userId, company_id: companyId, status: "active", deleted_at: null },
        select: { company_id: true },
      });
      if (!membership) return null;
      return tx.companies.findFirst({
        where: { id: companyId },
        select: { id: true, code: true, name: true },
      });
    });

    if (!company) throw Errors.forbidden("You are not a member of that company");

    await setSessionCookie({ userId: ctx.userId, companyId: company.id });
    return ok({ company });
  });
}

export async function DELETE() {
  return handle(async () => {
    const ctx = await requireSession();
    if (!(await isSuperadmin(ctx.userId))) {
      throw Errors.forbidden("Only a superadmin can leave a company context");
    }
    await setSessionCookie({ userId: ctx.userId, companyId: null });
    return ok({ company: null });
  });
}

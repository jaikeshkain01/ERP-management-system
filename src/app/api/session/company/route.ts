/**
 * POST /api/session/company  { companyId } — switch the ACTIVE company.
 * Verifies the user actually belongs to the target company, then re-issues the
 * session cookie with the new company id. Returns the newly active company.
 */
import { z } from "zod";
import { withUser } from "@/lib/prisma";
import { Errors, handle, ok, parseJson } from "@/lib/server/http";
import { requireSession, setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ companyId: z.string().uuid() });

export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireSession();
    const { companyId } = await parseJson(req, Body);

    const company = await withUser(ctx.userId, async (tx) => {
      const membership = await tx.company_memberships.findFirst({
        where: {
          user_id: ctx.userId,
          company_id: companyId,
          status: "active",
          deleted_at: null,
        },
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

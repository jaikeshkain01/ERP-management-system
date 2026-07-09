/**
 * GET /api/me/companies — the companies this user can access (for the company
 * switcher). Reads the user's own memberships under user RLS context.
 */
import { isTesting } from "@/lib/config";
import { withUser } from "@/lib/prisma";
import { handle, ok } from "@/lib/server/http";
import { MOCK_COMPANY } from "@/lib/server/mock";
import { requireSession } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const ctx = await requireSession();

    if (isTesting) {
      return ok([{ ...MOCK_COMPANY, isDefault: true, status: "active", isActive: true }]);
    }

    const companies = await withUser(ctx.userId, async (tx) => {
      const rows = await tx.company_memberships.findMany({
        where: { user_id: ctx.userId, deleted_at: null },
        select: { company_id: true, is_default: true, status: true, role_id: true },
      });
      const companyById = new Map(
        (
          await tx.companies.findMany({
            where: { id: { in: rows.map((r) => r.company_id) } },
            select: { id: true, code: true, name: true },
          })
        ).map((c) => [c.id, c]),
      );
      return rows
        .map((r) => {
          const c = companyById.get(r.company_id);
          return c
            ? {
                id: c.id,
                code: c.code,
                name: c.name,
                isDefault: r.is_default,
                status: r.status,
                isActive: r.company_id === ctx.companyId,
              }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    });

    return ok(companies);
  });
}

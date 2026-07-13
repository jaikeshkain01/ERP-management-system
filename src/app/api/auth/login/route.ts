/**
 * POST /api/auth/login  — public.
 * Verify credentials, resolve the user's default (or first active) company, issue
 * the session cookie for that {userId, companyId}, and return the user + company.
 */
import { z } from "zod";
import { prisma, withUser } from "@/lib/prisma";
import { verifyPassword } from "@/lib/server/auth";
import { Errors, handle, ok, parseJson } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  return handle(async () => {
    const { email, password } = await parseJson(req, LoginBody);

    // users is GLOBAL (no RLS) — safe to read without a tenant context.
    const user = await prisma.users.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, deleted_at: null },
      select: { id: true, name: true, email: true, password_hash: true, is_active: true },
    });

    // Same generic error for unknown user / bad password (no account enumeration).
    if (!user || !user.is_active || !(await verifyPassword(password, user.password_hash))) {
      throw Errors.unauthorized("Invalid email or password");
    }

    // Resolve active company from the user's memberships (needs user RLS context).
    const company = await withUser(user.id, async (tx) => {
      const membership =
        (await tx.company_memberships.findFirst({
          where: { user_id: user.id, status: "active", is_default: true, deleted_at: null },
          select: { company_id: true },
        })) ??
        (await tx.company_memberships.findFirst({
          where: { user_id: user.id, status: "active", deleted_at: null },
          select: { company_id: true },
          orderBy: { created_at: "asc" },
        }));
      if (!membership) return null;
      return tx.companies.findFirst({
        where: { id: membership.company_id },
        select: { id: true, code: true, name: true },
      });
    });

    if (!company) throw Errors.forbidden("No active company membership");

    await setSessionCookie({ userId: user.id, companyId: company.id });

    return ok({
      user: { id: user.id, name: user.name, email: user.email },
      company,
    });
  });
}

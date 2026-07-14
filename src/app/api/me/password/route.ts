/**
 * POST /api/me/password — self-service password change for the authenticated user.
 * Requires the current password (re-auth), then stores a fresh scrypt hash.
 * `users` is GLOBAL (no RLS), so it is read/written directly without tenant context.
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/server/auth";
import { Errors, handle, ok, parseJson } from "@/lib/server/http";
import { requireSession } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireSession();
    const { currentPassword, newPassword } = await parseJson(req, Body);

    const user = await prisma.users.findFirst({
      where: { id: ctx.userId, deleted_at: null, is_active: true },
      select: { password_hash: true },
    });
    if (!user) throw Errors.unauthorized();
    if (!(await verifyPassword(currentPassword, user.password_hash))) {
      throw Errors.badRequest("Current password is incorrect");
    }
    if (currentPassword === newPassword) {
      throw Errors.badRequest("New password must be different from the current one");
    }

    await prisma.users.update({
      where: { id: ctx.userId },
      data: { password_hash: await hashPassword(newPassword), updated_by: ctx.userId, updated_at: new Date() },
    });
    return ok({ ok: true });
  });
}

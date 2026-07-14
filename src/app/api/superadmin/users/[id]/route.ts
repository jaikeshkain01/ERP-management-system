/**
 * PATCH /api/superadmin/users/[id] — update a user's name / active / superadmin
 * flag, or reset their password (superadmin-only; you cannot revoke your own access).
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { updateUser } from "@/lib/server/data/superadmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
  isSuperadmin: z.boolean().optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await updateUser(id, await parseJson(req, Body)));
  });
}

/**
 * PATCH  /api/superadmin/memberships/[id] — change a membership's role / status /
 *        default company (superadmin-only).
 * DELETE /api/superadmin/memberships/[id] — remove the user from that company.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { removeMembership, updateMembership } from "@/lib/server/data/superadmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  roleId: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "invited", "suspended"]).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await updateMembership(id, await parseJson(req, Body)));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await removeMembership(id));
  });
}

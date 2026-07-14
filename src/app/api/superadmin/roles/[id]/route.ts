/**
 * PATCH  /api/superadmin/roles/[id] — rename / re-describe a role (superadmin-only).
 * DELETE /api/superadmin/roles/[id] — soft-delete a role with no members.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { deleteRole, updateRole } from "@/lib/server/data/superadmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await updateRole(id, await parseJson(req, Body)));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    await deleteRole(id);
    return ok({ id, deleted: true });
  });
}

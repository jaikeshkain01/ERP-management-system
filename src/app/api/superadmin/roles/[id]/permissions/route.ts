/**
 * PUT /api/superadmin/roles/[id]/permissions — replace a role's grants with the
 * supplied "resource.action" set (superadmin-only). Returns the updated role.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { setRolePermissions } from "@/lib/server/data/superadmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ permissions: z.array(z.string()) });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { permissions } = await parseJson(req, Body);
    return ok(await setRolePermissions(id, permissions));
  });
}

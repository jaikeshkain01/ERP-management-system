/**
 * POST /api/superadmin/users/[id]/memberships — add the user to a company with an
 * optional role (superadmin-only). Returns the updated user with all memberships.
 */
import { z } from "zod";
import { created, handle, parseJson } from "@/lib/server/http";
import { addMembership } from "@/lib/server/data/superadmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  companyId: z.string().uuid(),
  roleId: z.string().uuid().nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return created(await addMembership(id, await parseJson(req, Body)));
  });
}

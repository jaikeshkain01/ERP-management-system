/**
 * PATCH /api/superadmin/companies/[id] — rename or re-code a company (superadmin-only).
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { updateCompany } from "@/lib/server/data/superadmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().trim().min(2).max(32).optional(),
  name: z.string().trim().min(1).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await updateCompany(id, await parseJson(req, Body)));
  });
}

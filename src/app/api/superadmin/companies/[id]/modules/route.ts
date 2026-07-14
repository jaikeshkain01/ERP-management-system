/**
 * PUT /api/superadmin/companies/[id]/modules — toggle one licensed module for a
 * specific company (superadmin-only). Returns that company's full module map.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { setCompanyModule } from "@/lib/server/data/superadmin";
import { MODULE_IDS } from "@/lib/server/data/modules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  id: z.enum(MODULE_IDS),
  enabled: z.boolean(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id: companyId } = await params;
    const { id, enabled } = await parseJson(req, Body);
    return ok(await setCompanyModule(companyId, id, enabled));
  });
}

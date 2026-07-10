/**
 * GET /api/modules — the active company's module enable map (any member).
 * PUT /api/modules — toggle one module (`role.edit`); returns the full map.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { getModules, setModule, MODULE_IDS } from "@/lib/server/data/modules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await getModules()));
}

const PutBody = z.object({
  id: z.enum(MODULE_IDS),
  enabled: z.boolean(),
});

export async function PUT(req: Request) {
  return handle(async () => {
    const { id, enabled } = await parseJson(req, PutBody);
    return ok(await setModule(id, enabled));
  });
}

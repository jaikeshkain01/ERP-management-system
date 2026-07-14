/**
 * POST /api/superadmin/roles — create a role in a company with optional initial
 * permission grants (superadmin-only). Listing is served by the overview endpoint.
 */
import { z } from "zod";
import { created, handle, parseJson } from "@/lib/server/http";
import { createRole } from "@/lib/server/data/superadmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  companyId: z.string().uuid(),
  name: z.string().trim().min(1),
  description: z.string().max(2000).nullable().optional(),
  permissions: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  return handle(async () => created(await createRole(await parseJson(req, Body))));
}

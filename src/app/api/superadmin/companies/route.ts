/**
 * POST /api/superadmin/companies — create a tenant company (superadmin-only). A
 * default Admin role granting the full permission matrix is seeded alongside it.
 * Listing is served by GET /api/superadmin/overview.
 */
import { z } from "zod";
import { created, handle, parseJson } from "@/lib/server/http";
import { createCompany } from "@/lib/server/data/superadmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().trim().min(2).max(32),
  name: z.string().trim().min(1),
});

export async function POST(req: Request) {
  return handle(async () => created(await createCompany(await parseJson(req, Body))));
}

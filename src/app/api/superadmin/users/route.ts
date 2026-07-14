/**
 * POST /api/superadmin/users — create a global user (superadmin-only).
 * Listing is served by GET /api/superadmin/overview.
 */
import { z } from "zod";
import { created, handle, parseJson } from "@/lib/server/http";
import { createUser } from "@/lib/server/data/superadmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(6).optional(),
  isActive: z.boolean().optional(),
  isSuperadmin: z.boolean().optional(),
});

export async function POST(req: Request) {
  return handle(async () => created(await createUser(await parseJson(req, Body))));
}

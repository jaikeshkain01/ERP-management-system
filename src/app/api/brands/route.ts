/**
 * GET  /api/brands — list brands (real mode requires `brand.view`).
 * POST /api/brands — create a brand (`brand.create`). slug is derived from the name.
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { createBrand, listBrands } from "@/lib/server/data/brands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await listBrands()));
}

const CreateBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().max(2000).optional(),
  headquarter: z.string().max(200).optional(),
  founded: z.string().max(40).optional(),
  status: z.enum(["Approved", "Pending"]).optional(),
});

export async function POST(req: Request) {
  return handle(async () => created(await createBrand(await parseJson(req, CreateBody))));
}

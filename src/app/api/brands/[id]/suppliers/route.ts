/**
 * GET  /api/brands/[id]/suppliers — authorised suppliers mapped to a brand (`brand.view`).
 * POST /api/brands/[id]/suppliers — map a supplier to the brand (`brand.edit`).
 * `[id]` = brand uuid or slug.
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { addBrandSupplier, listBrandSuppliers } from "@/lib/server/data/brands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await listBrandSuppliers(id));
  });
}

const PostBody = z.object({
  supplier: z.string().trim().min(1),
  estPrice: z.number().nonnegative().nullable().optional(),
  moq: z.number().int().nonnegative().nullable().optional(),
  leadTimeDays: z.number().int().nonnegative().nullable().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return created(await addBrandSupplier(id, await parseJson(req, PostBody)));
  });
}

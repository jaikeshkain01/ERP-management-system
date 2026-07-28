/**
 * GET    /api/brands/[id] — brand detail by uuid or slug.
 * PATCH  /api/brands/[id] — edit a brand's own fields (`brand.edit`). slug is immutable.
 * DELETE /api/brands/[id] — soft-delete a brand (`brand.delete`; 409 if in use).
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { deleteBrand, getBrandDetail, updateBrand } from "@/lib/server/data/brands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getBrandDetail(id));
  });
}

const PatchBody = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().max(2000).nullable().optional(),
  headquarter: z.string().max(200).nullable().optional(),
  founded: z.string().max(40).nullable().optional(),
  status: z.enum(["Approved", "Pending", "Inactive"]).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await updateBrand(id, await parseJson(req, PatchBody)));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await deleteBrand(id));
  });
}

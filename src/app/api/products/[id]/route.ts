/**
 * GET    /api/products/[id] — product detail (counts + board list) by uuid/slug/code.
 * PATCH  /api/products/[id] — edit header fields (name/code/version/description/status/cost) (`product.edit`).
 * DELETE /api/products/[id] — soft-delete a catalog product (`product.delete`;
 *                             409 if it has live production orders).
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { deleteCatalogProduct, getProductDetail, updateCatalogProduct } from "@/lib/server/data/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().trim().min(1).optional(),
  code: z.string().trim().min(1).optional(),
  version: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["Ready", "Blocked", "Limited"]).optional(),
  estimatedCost: z.number().nonnegative().nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getProductDetail(id));
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await updateCatalogProduct(id, await parseJson(req, PatchBody)));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await deleteCatalogProduct(id));
  });
}

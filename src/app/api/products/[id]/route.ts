/**
 * GET    /api/products/[id] — product detail (counts + board list) by uuid/slug/code.
 * DELETE /api/products/[id] — soft-delete a catalog product (`product.delete`;
 *                             409 if it has live production orders).
 */
import { handle, ok } from "@/lib/server/http";
import { deleteCatalogProduct, getProductDetail } from "@/lib/server/data/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getProductDetail(id));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await deleteCatalogProduct(id));
  });
}

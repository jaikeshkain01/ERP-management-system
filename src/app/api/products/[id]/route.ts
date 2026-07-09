/** GET /api/products/[id] — product detail (counts + board list) by uuid/slug/code. */
import { handle, ok } from "@/lib/server/http";
import { getProductDetail } from "@/lib/server/data/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getProductDetail(id));
  });
}

/** GET /api/products/[id]/bom — flattened product → PCB → component BOM. */
import { handle, ok } from "@/lib/server/http";
import { getProductBom } from "@/lib/server/data/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getProductBom(id));
  });
}

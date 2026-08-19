/**
 * PATCH /api/products/[id]/pcbs/[linkId] — repoint a product's PCB usage to a
 * different revision of the SAME PCB. The multi-revision model lets a product
 * stay on Rev A while the PCB itself moves its Active pin to Rev C. `product.edit`.
 *
 * `[id]` = product uuid / slug / code; `[linkId]` = the `product_pcbs` row id
 * (returned in ProductDetailView.pcbs[i].linkId).
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { updateProductPcbRevision } from "@/lib/server/data/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  pcbRevisionId: z.string().uuid(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  return handle(async () => {
    const { id, linkId } = await params;
    return ok(await updateProductPcbRevision(id, linkId, await parseJson(req, Body)));
  });
}

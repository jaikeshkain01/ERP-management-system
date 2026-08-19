/**
 * DELETE /api/suppliers/[id]/prices/[priceId] — close/remove a price-book row (`supplier.edit`).
 * `[id]` = supplier uuid or slug; `[priceId]` = the price-row uuid (must belong to the supplier).
 */
import { handle, ok } from "@/lib/server/http";
import { deleteSupplierPrice } from "@/lib/server/data/suppliers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; priceId: string }> }) {
  return handle(async () => {
    const { id, priceId } = await params;
    return ok(await deleteSupplierPrice(id, priceId));
  });
}

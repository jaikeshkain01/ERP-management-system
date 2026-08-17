/**
 * POST /api/purchase-orders/[id]/cancel — cancel a PO (by po_no).
 * Blocked once received (fully or partially) or already cancelled. Requires `purchase_order.delete`.
 */
import { handle, ok } from "@/lib/server/http";
import { cancelPurchaseOrder } from "@/lib/server/data/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await cancelPurchaseOrder(id));
  });
}

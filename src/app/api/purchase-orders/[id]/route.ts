/**
 * GET /api/purchase-orders/[id] — one PO (by po_no), flattened item rows (`purchase_order.view`).
 */
import { handle, ok } from "@/lib/server/http";
import { getPurchaseOrder } from "@/lib/server/data/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getPurchaseOrder(id));
  });
}

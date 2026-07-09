/**
 * POST /api/purchase-orders/[id]/receive — goods-in for a PO (by po_no):
 * appends inventory IN ledger rows per line, bumps received_qty, PO → Completed.
 * Requires `purchase_order.edit` + `inventory.create`.
 */
import { handle, ok } from "@/lib/server/http";
import { receivePurchaseOrder } from "@/lib/server/data/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await receivePurchaseOrder(id));
  });
}

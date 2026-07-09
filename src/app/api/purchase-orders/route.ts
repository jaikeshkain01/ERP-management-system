/** GET /api/purchase-orders — flattened PO rows (requires `purchase_order.view`). */
import { handle, ok } from "@/lib/server/http";
import { listPurchaseOrders } from "@/lib/server/data/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await listPurchaseOrders()));
}

/**
 * GET /api/production-orders/[id]/items — STAGE 1 plan for an order (by order_no):
 * exploded BOM demand per component with derived allocated / consumed / available.
 * Requires `production_order.view`.
 */
import { handle, ok } from "@/lib/server/http";
import { getProductionOrderItems } from "@/lib/server/data/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getProductionOrderItems(id));
  });
}

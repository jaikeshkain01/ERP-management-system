/**
 * POST /api/production-orders/[id]/cancel — cancel a production order (by order_no).
 * Allowed only before consumption (Draft/Ready); releases open allocations. Requires `production_order.delete`.
 */
import { handle, ok } from "@/lib/server/http";
import { cancelProductionOrder } from "@/lib/server/data/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await cancelProductionOrder(id));
  });
}

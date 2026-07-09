/**
 * POST /api/production-orders/[id]/complete — STAGE 4: close a batch (In Progress →
 * Completed). Consumed components are already off the ledger; product finished-goods
 * stock is not modelled (see production.ts). Requires `production_order.edit`.
 */
import { handle, ok } from "@/lib/server/http";
import { completeProductionOrder } from "@/lib/server/data/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await completeProductionOrder(id));
  });
}

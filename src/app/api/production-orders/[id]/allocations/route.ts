/**
 * POST /api/production-orders/[id]/allocations — STAGE 2: reserve stock for every
 * pending item across its brand variants (order Draft → Ready). Atomic: if any item
 * is short, nothing is reserved (409 with the shortage list). Requires `production_order.edit`.
 */
import { handle, ok } from "@/lib/server/http";
import { allocateProductionOrder } from "@/lib/server/data/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await allocateProductionOrder(id));
  });
}

/**
 * POST /api/production-orders/[id]/consumptions — STAGE 3: issue reserved material to
 * the build. Appends CONSUMPTION ledger rows (on_hand −qty) and releases the reservations
 * (order Ready → In Progress). Requires `production_order.edit` + `inventory.create`.
 */
import { handle, ok } from "@/lib/server/http";
import { consumeProductionOrder } from "@/lib/server/data/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await consumeProductionOrder(id));
  });
}

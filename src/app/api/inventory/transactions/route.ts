/**
 * GET  /api/inventory/transactions — ledger history (filters + limit).
 * POST /api/inventory/transactions — append a movement (the write path).
 *   IN | OUT | TRANSFER | ADJUSTMENT | RETURN | CONSUMPTION | PRODUCTION.
 *   Requires `inventory.create`. Mock mode rejects writes (read-only).
 */
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { InventoryTxnBody, createInventoryTransaction, listLedger } from "@/lib/server/data/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const limit = sp.get("limit");
    return ok(
      await listLedger({
        variantId: sp.get("variantId") ?? undefined,
        warehouseId: sp.get("warehouseId") ?? undefined,
        locationId: sp.get("locationId") ?? undefined,
        type: sp.get("type") ?? undefined,
        from: sp.get("from") ?? undefined,
        to: sp.get("to") ?? undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseJson(req, InventoryTxnBody);
    return created(await createInventoryTransaction(body));
  });
}

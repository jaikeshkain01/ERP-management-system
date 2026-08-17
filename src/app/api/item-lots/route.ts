/**
 * GET /api/item-lots?variantId=&componentId= — list traceable lots (with derived
 * on-hand + valuation). Filter by brand variant or by component (all variants).
 * Guarded by `inventory.view`.
 */
import { handle, ok } from "@/lib/server/http";
import { listLots } from "@/lib/server/data/item-lots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    return ok(
      await listLots({
        variantId: url.searchParams.get("variantId") ?? undefined,
        componentId: url.searchParams.get("componentId") ?? undefined,
      }),
    );
  });
}

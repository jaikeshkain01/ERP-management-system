/**
 * GET /api/item-lots?variantId=&componentId=&expiringWithinDays=
 *   — list traceable lots (with derived on-hand + valuation). Filter by brand
 *   variant, by component (all variants), or by an "expires within N days"
 *   window (includes already-expired lots so the same call drives the
 *   near-expiry dashboard tile). Guarded by `inventory.view`.
 */
import { handle, ok } from "@/lib/server/http";
import { listLots } from "@/lib/server/data/item-lots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const days = url.searchParams.get("expiringWithinDays");
    const parsedDays = days == null ? undefined : Number(days);
    return ok(
      await listLots({
        variantId: url.searchParams.get("variantId") ?? undefined,
        componentId: url.searchParams.get("componentId") ?? undefined,
        expiringWithinDays: Number.isFinite(parsedDays) ? parsedDays : undefined,
      }),
    );
  });
}

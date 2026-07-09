/** GET /api/inventory — balance projection, filterable by component/variant/warehouse/location. */
import { handle, ok } from "@/lib/server/http";
import { listBalances } from "@/lib/server/data/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    return ok(
      await listBalances({
        componentId: sp.get("componentId") ?? undefined,
        variantId: sp.get("variantId") ?? undefined,
        warehouseId: sp.get("warehouseId") ?? undefined,
        locationId: sp.get("locationId") ?? undefined,
      }),
    );
  });
}

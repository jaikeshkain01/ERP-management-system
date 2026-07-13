/**
 * GET /api/production/readiness?product=<slug|code|uuid>&qty=<n> — batch material
 * audit: per-component required vs available for building `qty` units, plus the
 * biggest shortage and its sourcing options. `product` omitted → first product
 * with an Active BOM. Real mode: `production_order.view`.
 */
import { handle, ok } from "@/lib/server/http";
import { getReadiness } from "@/lib/server/data/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const product = sp.get("product") ?? undefined;
    const qty = Number(sp.get("qty") ?? "100");
    return ok(await getReadiness(product, qty));
  });
}

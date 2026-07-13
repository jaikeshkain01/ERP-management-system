/**
 * GET /api/purchases/recommendations?component=<pn|slug|uuid> — supplier sourcing
 * options for a component. `component` omitted → auto-picks the biggest current
 * BOM shortage. Real mode: `purchase_request.view`.
 */
import { handle, ok } from "@/lib/server/http";
import { getRecommendations } from "@/lib/server/data/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const component = sp.get("component") ?? undefined;
    return ok(await getRecommendations(component));
  });
}

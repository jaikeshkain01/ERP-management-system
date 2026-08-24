/**
 * GET /api/items/[id]/lots?variantId=&locationId=
 *   — lots of an item variant with positive on-hand (FEFO order). When
 *   `locationId` is given, on-hand is derived at that location only, so the
 *   Stock Out lot picker offers only consumable lots. Keyed on item_variant_id.
 */
import { handle, ok, Errors } from "@/lib/server/http";
import { getVariantLots } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, _ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const url = new URL(req.url);
    const variantId = url.searchParams.get("variantId");
    if (!variantId) throw Errors.badRequest("variantId is required");
    const locationId = url.searchParams.get("locationId") ?? undefined;
    return ok(await getVariantLots(variantId, locationId));
  });
}

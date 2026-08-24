/**
 * GET /api/items/[id]/ledger — recent inventory movements for an item, across
 * all its variants (newest first). Optional `?limit=` (default 100, max 500).
 * Powers the "Movement history" section on /items/details/[id].
 */
import { handle, ok } from "@/lib/server/http";
import { getItemLedger } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const limitRaw = new URL(req.url).searchParams.get("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    return ok(await getItemLedger(id, Number.isFinite(limit as number) ? (limit as number) : undefined));
  });
}

/**
 * GET /api/items/[id]/stock — rolled-up stock keyed on `item_variant_id`.
 * Works for every item type — including manufactured products and PCB
 * revisions (F5.4 opened the ledger to those). Returns the ItemStockView
 * shape (see src/lib/server/data/items.ts).
 */
import { handle, ok } from "@/lib/server/http";
import { getItemStock } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    return ok(await getItemStock(id));
  });
}

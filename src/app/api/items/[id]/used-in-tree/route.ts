/**
 * GET /api/items/[id]/used-in-tree — where-used graph walked upwards.
 *
 * Returns every (parent → child) edge reachable from the item within N
 * levels. The client folds these into a nested tree in the details page's
 * right sidebar.
 */
import { handle, ok } from "@/lib/server/http";
import { getItemUsedInTree } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    return ok(await getItemUsedInTree(id));
  });
}

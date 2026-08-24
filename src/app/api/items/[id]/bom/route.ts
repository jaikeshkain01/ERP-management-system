/**
 * GET /api/items/[id]/bom — the item's universal BOM (F6.3).
 * Optional `?version=<uuid>` selects a specific version; default is the Active
 * one (else the latest). Returns { versions, selectedVersionId, lines } — see
 * ItemBomView in src/lib/server/data/items.ts. Empty versions for items with
 * no BOM.
 */
import { handle, ok } from "@/lib/server/http";
import { getItemBom } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const version = new URL(req.url).searchParams.get("version") ?? undefined;
    return ok(await getItemBom(id, version));
  });
}

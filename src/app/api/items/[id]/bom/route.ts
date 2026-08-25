/**
 * GET  /api/items/[id]/bom       — the item's universal BOM (F6.3).
 *   Optional `?version=<uuid>` selects a specific version; default is the
 *   Active one (else the latest). Returns { versions, selectedVersionId, lines }
 *   — see ItemBomView in src/lib/server/data/items.ts. Empty versions for
 *   items with no BOM.
 *
 * POST /api/items/[id]/bom       — create a Draft BOM version (F6.4 / B1).
 *   Body: { version?, effectiveFrom?, effectiveTo?, copyLinesFromVersionId? }.
 *   Auto-numbers when `version` omitted. When `copyLinesFromVersionId` is
 *   given, seeds the Draft with a copy of that version's lines — the
 *   "New revision from active" flow. Returns the full ItemBomView.
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { createItemBomVersion, getItemBom } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const version = new URL(req.url).searchParams.get("version") ?? undefined;
    return ok(await getItemBom(id, version));
  });
}

const CreateBody = z.object({
  version: z.string().trim().min(1).max(50).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be yyyy-mm-dd").nullable().optional(),
  effectiveTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be yyyy-mm-dd").nullable().optional(),
  copyLinesFromVersionId: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    return created(await createItemBomVersion(id, await parseJson(req, CreateBody)));
  });
}

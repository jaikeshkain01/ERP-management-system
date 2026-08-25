/**
 * PATCH  /api/items/[id]/bom/[versionId] — whole-version replace of the lines
 *   (F6.4 / B1). Only allowed on Draft versions. Body: { lines: BomLineInput[] }.
 *   Server diffs by (versionId, childItemId): soft-deletes drops, upserts the
 *   rest. Returns the full ItemBomView after the write.
 *
 * DELETE /api/items/[id]/bom/[versionId] — soft-delete a Draft version + its
 *   lines. Active/Superseded/Obsolete versions are refused (they carry
 *   historical context that production runs may reference).
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { deleteBomVersion, saveBomLines } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LineBody = z.object({
  childItemId: z.string().uuid(),
  qty: z.number().positive(),
  refDes: z.string().trim().max(400).nullable().optional(),
  preferredBrandId: z.string().uuid().nullable().optional(),
  sequence: z.number().int().nullable().optional(),
  remarks: z.string().trim().max(1000).nullable().optional(),
});

const PatchBody = z.object({
  lines: z.array(LineBody).max(2000),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; versionId: string }> },
) {
  return handle(async () => {
    const { id, versionId } = await ctx.params;
    const { lines } = await parseJson(req, PatchBody);
    return ok(await saveBomLines(id, versionId, lines));
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; versionId: string }> },
) {
  return handle(async () => {
    const { id, versionId } = await ctx.params;
    return ok(await deleteBomVersion(id, versionId));
  });
}

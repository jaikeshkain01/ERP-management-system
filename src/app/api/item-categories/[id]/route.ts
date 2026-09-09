/**
 * PATCH  /api/item-categories/[id] — rename / re-parent a category (recomputes the
 *   `path` for the node + descendants). Guarded by `component.edit`.
 * DELETE /api/item-categories/[id] — soft-delete a leaf with no children/items (else 409).
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { deleteItemCategory, updateItemCategory } from "@/lib/server/data/item-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().trim().min(1).optional(),
  parentId: z.string().uuid().nullable().optional(),
  defaultItemType: z
    .enum(["raw", "sub_assembly", "finished_product", "consumable", "asset", "packaging"])
    .nullable()
    .optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await updateItemCategory(id, await parseJson(req, PatchBody)));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await deleteItemCategory(id));
  });
}

/**
 * PATCH  /api/warehouses/[id]/locations/[locId] — edit code / name / parent / default-bin (`warehouse.edit`).
 * DELETE /api/warehouses/[id]/locations/[locId] — soft-delete a leaf with no children/stock (`warehouse.delete`; 409 if used).
 * `[id]` = warehouse uuid or code; `[locId]` = the location uuid.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { deleteLocation, updateLocation } from "@/lib/server/data/warehouses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().max(200).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; locId: string }> }) {
  return handle(async () => {
    const { id, locId } = await params;
    return ok(await updateLocation(id, locId, await parseJson(req, PatchBody)));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; locId: string }> }) {
  return handle(async () => {
    const { id, locId } = await params;
    return ok(await deleteLocation(id, locId));
  });
}

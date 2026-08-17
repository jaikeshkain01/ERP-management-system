/**
 * PATCH  /api/components/[id]/variants/[variantId] — fix a variant's manufacturer / MPN (`component.edit`).
 * DELETE /api/components/[id]/variants/[variantId] — remove a variant with no stock/price (`component.edit`; 409 if used).
 * `[id]` = component uuid or generic_pn; `[variantId]` = the variant uuid.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { deleteComponentVariant, updateComponentVariant } from "@/lib/server/data/components";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  brand: z.string().trim().min(1).optional(),
  partNo: z.string().trim().min(1).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  return handle(async () => {
    const { id, variantId } = await params;
    return ok(await updateComponentVariant(id, variantId, await parseJson(req, PatchBody)));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  return handle(async () => {
    const { id, variantId } = await params;
    return ok(await deleteComponentVariant(id, variantId));
  });
}

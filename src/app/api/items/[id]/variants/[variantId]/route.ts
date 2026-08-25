/**
 * PATCH  /api/items/[id]/variants/[variantId] — rename brand, change MPN, or
 *   promote to default. F5.6 completes the P15 gap so the Manufacturer
 *   section on `/items/edit` can persist edits.
 *
 * DELETE /api/items/[id]/variants/[variantId] — soft-delete a purchased
 *   variant. Guards on positive on-hand, open POs, last-remaining-variant.
 *   If the deleted variant was the item's default, the earliest surviving
 *   variant auto-promotes to default in the same transaction.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { deleteItemVariant, updateItemVariant } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  brand: z.string().trim().min(1).max(200).optional(),
  partNo: z.string().max(200).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; variantId: string }> },
) {
  return handle(async () => {
    const { id, variantId } = await ctx.params;
    return ok(await updateItemVariant(id, variantId, await parseJson(req, PatchBody)));
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; variantId: string }> },
) {
  return handle(async () => {
    const { id, variantId } = await ctx.params;
    return ok(await deleteItemVariant(id, variantId));
  });
}

/**
 * GET    /api/items/[id] — fetch one item with its variants.
 * PATCH  /api/items/[id] — update master fields (F5.1). Dual-writes to the
 *                         underlying `components` row for backfilled raw items.
 *                         Product/pcb_revision items return 400 with a hint.
 * DELETE /api/items/[id] — soft-delete the item + variants + legacy row.
 *                         Blocked on positive on-hand and BOM usage.
 *
 * Item CREATE stays on `POST /api/items`. Variant-level CRUD (add/remove/swap
 * brand variants on an item) belongs to a later slice — the existing
 * `component_brand_variants` endpoints still own that surface.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { deleteItem, getItem, updateItem } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    return ok(await getItem(id));
  });
}

const PatchBody = z.object({
  code: z.string().trim().min(1).max(100).optional(),
  genericPn: z.string().trim().max(200).nullable().optional(),
  solderType: z.enum(["SMD", "DIP"]).nullable().optional(),
  footprint: z.string().trim().max(200).nullable().optional(),
  spq: z.number().int().positive().nullable().optional(),
  packageLengthMm: z.number().positive().nullable().optional(),
  packageWidthMm:  z.number().positive().nullable().optional(),
  packageHeightMm: z.number().positive().nullable().optional(),
  packageWeightG:  z.number().positive().nullable().optional(),
  tareWeightG:     z.number().positive().nullable().optional(),
  packageMaterial: z.string().trim().max(200).nullable().optional(),
  packageReusable: z.boolean().nullable().optional(),
  storageTempMinC: z.number().min(-100).max(200).nullable().optional(),
  storageTempMaxC: z.number().min(-100).max(200).nullable().optional(),
  storageHumidityMinPct: z.number().min(0).max(100).nullable().optional(),
  storageHumidityMaxPct: z.number().min(0).max(100).nullable().optional(),
  mslLevel: z.enum(["1", "2", "2a", "3", "4", "5", "5a", "6"]).nullable().optional(),
  hazardous: z.boolean().nullable().optional(),
  expiryTracked: z.boolean().nullable().optional(),
  custodianUserId: z.string().uuid().nullable().optional(),
  serialNumber: z.string().trim().max(200).nullable().optional(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be yyyy-mm-dd").nullable().optional(),
  purchaseCost: z.number().nonnegative().nullable().optional(),
  warrantyMonths: z.number().int().nonnegative().nullable().optional(),
  usefulLifeMonths: z.number().int().positive().nullable().optional(),
  salvageValue: z.number().nonnegative().nullable().optional(),
  depreciationMethod: z.enum(["none", "straight_line", "reducing_balance"]).nullable().optional(),
  conditionKind: z.enum(["new", "good", "fair", "poor", "retired"]).nullable().optional(),
  name: z.string().trim().min(1).max(400).optional(),
  description: z.string().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  baseUom: z.string().trim().min(1).max(20).optional(),
  minStock: z.number().nonnegative().optional(),
  reorderQty: z.number().nonnegative().optional(),
  safetyStock: z.number().nonnegative().optional(),
  leadTimeDays: z.number().int().nonnegative().nullable().optional(),
  specs: z.unknown().optional(),
  status: z.enum(["active", "inactive", "discontinued"]).optional(),
  isFinishedGood: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    return ok(await updateItem(id, await parseJson(req, PatchBody)));
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    return ok(await deleteItem(id));
  });
}

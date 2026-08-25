/**
 * GET  /api/items       — list items (filters: q, itemType, status, categoryId).
 * POST /api/items       — create an item + optional variants.
 *
 * Introduced by F1 of the universal-item transformation. Additive endpoint:
 * `components`, `products`, `pcbs` endpoints continue to serve legacy consumers
 * unchanged. F5 cutover will make those endpoints thin adapters over this one.
 *
 * Guarded via `component.*` (matches item-categories) until a dedicated
 * `item.*` resource is introduced with F5.
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { createItem, listItems, type ItemFilters } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ITEM_TYPE = z.enum(["raw", "semi_assembled", "assembled", "consumable", "asset", "packaging"]);
const ITEM_STATUS = z.enum(["active", "inactive", "discontinued"]);

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const filters: ItemFilters = {};
    const q = url.searchParams.get("q");
    if (q) filters.q = q;
    const itemType = url.searchParams.get("itemType");
    if (itemType) filters.itemType = ITEM_TYPE.parse(itemType);
    const status = url.searchParams.get("status");
    if (status) filters.status = ITEM_STATUS.parse(status);
    const categoryId = url.searchParams.get("categoryId");
    if (categoryId) filters.categoryId = categoryId;
    return ok(await listItems(filters));
  });
}

const VariantBody = z.object({
  sourceKind: z.enum(["purchased", "manufactured"]).optional(),
  brandId: z.string().uuid().nullable().optional(),
  partNo: z.string().max(200).nullable().optional(),
  isDefault: z.boolean().optional(),
});

const CreateBody = z.object({
  code: z.string().trim().min(1).max(100),
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
  name: z.string().trim().min(1).max(400),
  description: z.string().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  itemType: ITEM_TYPE.optional(),
  baseUom: z.string().trim().min(1).max(20).optional(),
  minStock: z.number().nonnegative().optional(),
  reorderQty: z.number().nonnegative().optional(),
  safetyStock: z.number().nonnegative().optional(),
  leadTimeDays: z.number().int().nonnegative().nullable().optional(),
  specs: z.unknown().optional(),
  status: ITEM_STATUS.optional(),
  isFinishedGood: z.boolean().optional(),
  variants: z.array(VariantBody).max(50).optional(),
});

export async function POST(req: Request) {
  return handle(async () => created(await createItem(await parseJson(req, CreateBody))));
}

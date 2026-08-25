/**
 * GET  /api/item-categories — the tenant's category tree (flat, ordered by path).
 * POST /api/item-categories — create a category node (optionally under a parent).
 * Guarded by component.view / component.edit (categories are item-master config).
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { createItemCategory, listItemCategories } from "@/lib/server/data/item-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await listItemCategories()));
}

// `defaultItemType` (the category's stage) is now REQUIRED — every category
// belongs to exactly one stage and the picker is filtered by it.
const Body = z.object({
  name: z.string().trim().min(1),
  parentId: z.string().uuid().nullable().optional(),
  defaultItemType: z.enum(["raw", "semi_assembled", "assembled", "consumable", "asset", "packaging"]),
});

export async function POST(req: Request) {
  return handle(async () => created(await createItemCategory(await parseJson(req, Body))));
}

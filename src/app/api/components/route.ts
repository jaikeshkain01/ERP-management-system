/**
 * GET  /api/components — list components in the active company.
 * POST /api/components — create a component + brand variants (+ optional opening stock).
 * Requires `component.view` / `.create` (auth + RLS). See the provider in
 * src/lib/server/data/components.ts.
 * Supports filters: category, solderType, footprint, q (search).
 *
 * NOTE: stock/stockStatus and brand/supplier filters are DERIVED from the
 * inventory ledger + supplier price book (ARCHITECTURE.md §7a/§2) — deferred.
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { createComponent, listComponents } from "@/lib/server/data/components";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  category: z.string().trim().min(1).optional(),
  solderType: z.enum(["SMD", "DIP"]).optional(),
  footprint: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
});

export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const filters = Query.parse({
      category: sp.get("category") ?? undefined,
      solderType: sp.get("solderType") ?? undefined,
      footprint: sp.get("footprint") ?? undefined,
      q: sp.get("q") ?? undefined,
    });
    return ok(await listComponents(filters));
  });
}

const Body = z.object({
  genericPN: z.string().trim().min(1),
  name: z.string().trim().min(1),
  category: z.string().trim().min(1).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  itemType: z.enum(["raw", "semi_assembled", "assembled", "consumable", "asset", "packaging"]).optional(),
  description: z.string().max(2000).optional(),
  unit: z.string().trim().min(1).optional(),
  solderType: z.enum(["SMD", "DIP"]).optional(),
  footprint: z.string().trim().min(1).optional(),
  spq: z.number().int().positive().optional(),
  minStock: z.number().nonnegative().optional(),
  reorderQty: z.number().nonnegative().optional(),
  specs: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  variants: z
    .array(z.object({ brand: z.string().trim().min(1), partNo: z.string().trim().min(1), stock: z.number().nonnegative().optional() }))
    .optional(),
});

export async function POST(req: Request) {
  return handle(async () => created(await createComponent(await parseJson(req, Body))));
}

/**
 * GET  /api/production-orders — kanban list (one row per order).
 * POST /api/production-orders — STAGE 1: create a Draft order + exploded BOM plan.
 *   Requires `production_order.view` / `.create`. Mock mode: reads only.
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { createProductionOrder, listProductionOrders } from "@/lib/server/data/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  product: z.string().trim().min(1),
  qty: z.number().int().positive(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "targetDate must be YYYY-MM-DD").optional(),
});

export async function GET() {
  return handle(async () => ok(await listProductionOrders()));
}

export async function POST(req: Request) {
  return handle(async () => created(await createProductionOrder(await parseJson(req, Body))));
}

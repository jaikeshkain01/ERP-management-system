/**
 * GET  /api/warehouses — list warehouses (`warehouse.view`).
 * POST /api/warehouses — create a warehouse (`warehouse.create`).
 */
import { z } from "zod";
import { handle, ok, created, parseJson } from "@/lib/server/http";
import { createWarehouse, listWarehouses } from "@/lib/server/data/warehouses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PostBody = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  location: z.string().trim().max(200).nullable().optional(),
  isFinishedGoods: z.boolean().optional(),
});

export async function GET() {
  return handle(async () => ok(await listWarehouses()));
}

export async function POST(req: Request) {
  return handle(async () => created(await createWarehouse(await parseJson(req, PostBody))));
}

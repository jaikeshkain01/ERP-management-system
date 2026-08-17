/**
 * GET    /api/warehouses/[id] — one warehouse (`warehouse.view`).
 * PATCH  /api/warehouses/[id] — edit code / name / location / finished-goods flag (`warehouse.edit`).
 * DELETE /api/warehouses/[id] — soft-delete a warehouse with no stock (`warehouse.delete`; 409 if stocked).
 * `[id]` accepts a uuid or the warehouse code.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { deleteWarehouse, getWarehouse, updateWarehouse } from "@/lib/server/data/warehouses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  location: z.string().trim().max(200).nullable().optional(),
  isFinishedGoods: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getWarehouse(id));
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await updateWarehouse(id, await parseJson(req, PatchBody)));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await deleteWarehouse(id));
  });
}

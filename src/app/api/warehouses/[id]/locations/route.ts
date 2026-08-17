/**
 * GET  /api/warehouses/[id]/locations — the Zone→Rack→Bin tree (flat list) (`warehouse.view`).
 * POST /api/warehouses/[id]/locations — add a location (`warehouse.create`).
 */
import { z } from "zod";
import { handle, ok, created, parseJson } from "@/lib/server/http";
import { createLocation, getWarehouseLocations } from "@/lib/server/data/warehouses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PostBody = z.object({
  kind: z.enum(["zone", "rack", "bin"]),
  code: z.string().trim().min(1),
  name: z.string().trim().max(200).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getWarehouseLocations(id));
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return created(await createLocation(id, await parseJson(req, PostBody)));
  });
}

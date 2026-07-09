/** GET /api/warehouses/[id]/locations — the Zone→Rack→Bin tree (flat list). */
import { handle, ok } from "@/lib/server/http";
import { getWarehouseLocations } from "@/lib/server/data/warehouses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getWarehouseLocations(id));
  });
}

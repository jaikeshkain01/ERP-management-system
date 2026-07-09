/** GET /api/warehouses — list warehouses (real mode: `warehouse.view`). */
import { handle, ok } from "@/lib/server/http";
import { listWarehouses } from "@/lib/server/data/warehouses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await listWarehouses()));
}

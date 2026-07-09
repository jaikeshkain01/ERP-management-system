/** GET /api/suppliers — list suppliers (real mode requires `supplier.view`). */
import { handle, ok } from "@/lib/server/http";
import { listSuppliers } from "@/lib/server/data/suppliers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await listSuppliers()));
}

/** GET /api/pcbs — list PCBs with BOM totals + used-in (real mode: `pcb.view`). */
import { handle, ok } from "@/lib/server/http";
import { listPcbs } from "@/lib/server/data/pcbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await listPcbs()));
}

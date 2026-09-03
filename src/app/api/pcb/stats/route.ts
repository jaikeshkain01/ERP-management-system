/**
 * GET /api/pcb/stats — Semi-assembled workspace stats.
 *
 * Returns one row per semi_assembled item that has at least one BOM
 * version or one assembled parent referencing it. Consumed by
 * /pcb-management/list to badge cards with revisions and used-in.
 */
import { handle, ok } from "@/lib/server/http";
import { getSemiAssembledStats } from "@/lib/server/data/pcb-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await getSemiAssembledStats()));
}

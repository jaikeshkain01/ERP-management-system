/**
 * GET /api/products/stats — Assembled Products workspace stats.
 *
 * Returns one row per assembled item that carries an Active BOM,
 * badged with Active BOM version + line count, buildable qty, and
 * open production-order count. Consumed by /products/list.
 */
import { handle, ok } from "@/lib/server/http";
import { getAssembledProductStats } from "@/lib/server/data/products-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await getAssembledProductStats()));
}

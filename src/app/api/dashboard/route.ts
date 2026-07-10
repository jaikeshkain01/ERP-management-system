/**
 * GET /api/dashboard — cross-module overview aggregates (inventory valuation,
 * production blockers, purchasing pipeline counts, recent production orders and
 * activity). Catalog panels are derived client-side from /api/bootstrap.
 * Requires `component.view`.
 */
import { handle, ok } from "@/lib/server/http";
import { getDashboard } from "@/lib/server/data/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await getDashboard()));
}

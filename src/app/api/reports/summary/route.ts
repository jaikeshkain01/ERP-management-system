/**
 * GET /api/reports/summary — headline production KPIs (total batches, units
 * produced, avg yield %, avg lead time in days). Requires `report.view`.
 */
import { handle, ok } from "@/lib/server/http";
import { getReportsSummary } from "@/lib/server/data/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await getReportsSummary()));
}

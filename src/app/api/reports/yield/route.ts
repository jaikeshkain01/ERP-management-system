/**
 * GET /api/reports/yield?range=6m — monthly finished-batch output (Σ qty of Completed
 * production orders, bucketed by month), zero-filled to the last N months. Requires `report.view`.
 */
import { z } from "zod";
import { handle, ok } from "@/lib/server/http";
import { getYieldReport } from "@/lib/server/data/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({ range: z.string().regex(/^\d{1,2}m$/).optional() });

export async function GET(req: Request) {
  return handle(async () => {
    const { range } = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
    return ok(await getYieldReport(range));
  });
}

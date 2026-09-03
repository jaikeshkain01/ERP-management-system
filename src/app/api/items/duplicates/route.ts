/**
 * GET /api/items/duplicates — clusters of likely-duplicate raw items.
 *
 * Powers the /items/merger UI. Detection is name-based (case-insensitive,
 * trimmed) with per-cluster invariants (footprint / solder / category /
 * description) reported so the operator can decide.
 */
import { handle, ok } from "@/lib/server/http";
import { listDuplicateClusters } from "@/lib/server/data/items-merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await listDuplicateClusters()));
}

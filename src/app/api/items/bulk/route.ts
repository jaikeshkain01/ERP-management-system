/**
 * POST /api/items/bulk — apply the same action to N items.
 *
 * Body: { ids: uuid[], action: "activate" | "deactivate" | "discontinue" |
 *                              "mark_finished" | "unmark_finished" | "delete" }
 * Returns: { action, succeeded: uuid[], failed: Array<{id, reason}> }
 *
 * Not transactional — each item runs its own updateItem/deleteItem and is
 * reported per-id so the client can show which rows failed and why (e.g.
 * "delete blocked: item still has on-hand stock").
 */
import { handle, ok, parseJson } from "@/lib/server/http";
import { bulkUpdateItems, BulkInputSchema } from "@/lib/server/data/items-bulk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => ok(await bulkUpdateItems(await parseJson(req, BulkInputSchema))));
}

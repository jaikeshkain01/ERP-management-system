/**
 * POST /api/items/merge — collapse two raw items into one.
 *
 * Body: { keepId, discardId } — both raw items in the same tenant.
 * Effect: variants/inventory/lots follow their variant to `keepId`; every
 * BOM line referencing `discardId` is re-linked; `discardId` is soft-deleted.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { mergeItems } from "@/lib/server/data/items-merge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  keepId: z.string().uuid(),
  discardId: z.string().uuid(),
});

export async function POST(req: Request) {
  return handle(async () => ok(await mergeItems(await parseJson(req, Body))));
}

/**
 * POST /api/items/[id]/bom/[versionId]/activate — flip a Draft version to
 * Active (F6.4 / B1). Prior Active (if any) is superseded in the same
 * transaction so the partial unique index never sees two Actives. No body.
 */
import { handle, ok } from "@/lib/server/http";
import { activateBomVersion } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; versionId: string }> },
) {
  return handle(async () => {
    const { id, versionId } = await ctx.params;
    return ok(await activateBomVersion(id, versionId));
  });
}

/**
 * GET /api/items/[id]/pcb-usage — which live PCB revisions' BOM lines
 * reference this item. Works for component-backed items; returns [] for
 * product / PCB-revision items.
 */
import { handle, ok } from "@/lib/server/http";
import { getItemPcbUsage } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getItemPcbUsage(id));
  });
}

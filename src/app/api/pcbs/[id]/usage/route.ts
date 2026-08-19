/**
 * GET /api/pcbs/[id]/usage — Product ↔ Revision map for this PCB
 * (which product pins to which revision, and at what qty per unit). `pcb.view`.
 */
import { handle, ok } from "@/lib/server/http";
import { listPcbProductUsage } from "@/lib/server/data/pcbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await listPcbProductUsage(id));
  });
}

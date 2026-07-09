/** GET /api/pcbs/[id] — PCB detail by uuid or slug. */
import { handle, ok } from "@/lib/server/http";
import { getPcbDetail } from "@/lib/server/data/pcbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getPcbDetail(id));
  });
}

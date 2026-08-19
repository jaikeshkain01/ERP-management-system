/**
 * GET /api/pcbs/[id]/bom — resolved BOM lines (component + qty + preferred brand).
 * `?revision=<uuid>` pins the read to a specific revision; default = the PCB's Active revision.
 */
import { handle, ok } from "@/lib/server/http";
import { getPcbBom } from "@/lib/server/data/pcbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const revision = new URL(req.url).searchParams.get("revision") ?? undefined;
    return ok(await getPcbBom(id, revision));
  });
}

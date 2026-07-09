/** GET /api/brands/[id]/components — components carried by this brand. */
import { handle, ok } from "@/lib/server/http";
import { getBrandComponents } from "@/lib/server/data/brands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getBrandComponents(id));
  });
}

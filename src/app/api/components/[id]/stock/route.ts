/** GET /api/components/[id]/stock — rolled-up stock (by uuid or generic PN). */
import { handle, ok } from "@/lib/server/http";
import { getComponentStock } from "@/lib/server/data/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getComponentStock(id));
  });
}

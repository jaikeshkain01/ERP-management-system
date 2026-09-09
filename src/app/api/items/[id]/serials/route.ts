import { handle, ok } from "@/lib/server/http";
import { getItemSerials } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    return ok(await getItemSerials(id));
  });
}

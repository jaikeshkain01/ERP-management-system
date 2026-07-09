/**
 * POST /api/components/[id]/variants — add a brand variant to a component (`component.edit`;
 * opening stock additionally needs `inventory.create`). `[id]` = uuid or generic_pn.
 * The brand is resolved by name (created if new); a duplicate (component, brand) → 409.
 */
import { z } from "zod";
import { created, handle, parseJson } from "@/lib/server/http";
import { addComponentVariant } from "@/lib/server/data/components";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  brand: z.string().trim().min(1),
  partNo: z.string().trim().min(1),
  stock: z.number().nonnegative().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return created(await addComponentVariant(id, await parseJson(req, Body)));
  });
}

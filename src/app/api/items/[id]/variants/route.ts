/**
 * POST /api/items/[id]/variants — attach a purchased brand variant to an item
 * (add-form P3). Brand is resolved by name (created if missing). Opening stock
 * is not supported here yet — the F3 ledger invariant blocks stock rows on
 * pure-universal items until F5.3 + F5.4 land.
 */
import { z } from "zod";
import { created, handle, parseJson } from "@/lib/server/http";
import { addItemVariant } from "@/lib/server/data/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  brand: z.string().trim().min(1),
  partNo: z.string().max(200).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return created(await addItemVariant(id, await parseJson(req, Body)));
  });
}

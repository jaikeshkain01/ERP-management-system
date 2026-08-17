/**
 * GET    /api/item-lots/[id] — one lot (with derived on-hand + valuation) (`inventory.view`).
 * PATCH  /api/item-lots/[id] — correct lot no / dates / cost / supplier / MSL / date-code (`inventory.edit`).
 * DELETE /api/item-lots/[id] — soft-delete a lot with no stock movements (`inventory.edit`; 409 if used).
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { deleteLot, getLot, updateLot } from "@/lib/server/data/item-lots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  lotNo: z.string().trim().min(1).optional(),
  supplier: z.string().nullable().optional(),
  receivedDate: z.string().date().nullable().optional(),
  mfgDate: z.string().date().nullable().optional(),
  expiryDate: z.string().date().nullable().optional(),
  unitCost: z.number().nonnegative().nullable().optional(),
  dateCode: z.string().max(100).nullable().optional(),
  msl: z.string().max(50).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getLot(id));
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await updateLot(id, await parseJson(req, PatchBody)));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await deleteLot(id));
  });
}

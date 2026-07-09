/**
 * GET  /api/suppliers/[id]/prices — the supplier's current price book.
 * POST /api/suppliers/[id]/prices — set the current price for a (component, brand) (`supplier.edit`).
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { getSupplierPrices, upsertSupplierPrice } from "@/lib/server/data/suppliers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getSupplierPrices(id));
  });
}

const PriceBody = z.object({
  component: z.string().trim().min(1), // uuid or generic_pn
  brand: z.string().trim().min(1), // uuid or slug
  price: z.number().positive(),
  currency: z.string().trim().length(3).optional(),
  moq: z.number().nonnegative().optional(),
  spq: z.number().nonnegative().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return created(await upsertSupplierPrice(id, await parseJson(req, PriceBody)));
  });
}

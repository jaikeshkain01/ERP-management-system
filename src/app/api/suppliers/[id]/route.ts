/**
 * GET   /api/suppliers/[id] — supplier detail by uuid or slug.
 * PATCH /api/suppliers/[id] — edit a supplier's own fields (`supplier.edit`). slug is immutable.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { getSupplierDetail, updateSupplier } from "@/lib/server/data/suppliers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getSupplierDetail(id));
  });
}

const PatchBody = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().max(2000).nullable().optional(),
  contact: z.string().max(200).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  terms: z.string().max(200).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await updateSupplier(id, await parseJson(req, PatchBody)));
  });
}

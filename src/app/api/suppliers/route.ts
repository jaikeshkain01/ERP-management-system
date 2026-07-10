/**
 * GET  /api/suppliers — list suppliers (real mode requires `supplier.view`).
 * POST /api/suppliers — create a supplier (`supplier.create`). slug is derived from the name.
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { createSupplier, listSuppliers } from "@/lib/server/data/suppliers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await listSuppliers()));
}

const CreateBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().max(2000).optional(),
  contact: z.string().max(200).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  address: z.string().max(500).optional(),
  terms: z.string().max(200).optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
});

export async function POST(req: Request) {
  return handle(async () => created(await createSupplier(await parseJson(req, CreateBody))));
}

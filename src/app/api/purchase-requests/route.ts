/**
 * GET  /api/purchase-requests — flattened PR rows (one per item).
 * POST /api/purchase-requests — create a PR (Submitted) with one line.
 *   Requires `purchase_request.view` / `.create`. Mock mode: reads only.
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { createPurchaseRequest, listPurchaseRequests } from "@/lib/server/data/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  componentPN: z.string().trim().min(1),
  brandSlug: z.string().trim().min(1),
  supplierSlug: z.string().trim().min(1),
  qty: z.number().positive(),
  remarks: z.string().max(500).optional(),
});

export async function GET() {
  return handle(async () => ok(await listPurchaseRequests()));
}

export async function POST(req: Request) {
  return handle(async () => created(await createPurchaseRequest(await parseJson(req, Body))));
}

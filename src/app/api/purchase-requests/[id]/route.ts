/**
 * GET /api/purchase-requests/[id] — one PR (by pr_no), flattened item rows (`purchase_request.view`).
 */
import { handle, ok } from "@/lib/server/http";
import { getPurchaseRequest } from "@/lib/server/data/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getPurchaseRequest(id));
  });
}

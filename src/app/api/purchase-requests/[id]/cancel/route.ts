/**
 * POST /api/purchase-requests/[id]/cancel — cancel/reject a PR (by pr_no).
 * Blocked once a PO exists or the PR is already terminal. Requires `purchase_request.delete`.
 */
import { handle, ok } from "@/lib/server/http";
import { cancelPurchaseRequest } from "@/lib/server/data/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await cancelPurchaseRequest(id));
  });
}

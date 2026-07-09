/**
 * POST /api/purchase-requests/[id]/approve — approve a PR (by pr_no) end-to-end:
 * records manager+procurement approvals, PR → 'PO Created', creates the PO (Sent).
 * Requires `purchase_request.approve`.
 */
import { handle, ok } from "@/lib/server/http";
import { approvePurchaseRequest } from "@/lib/server/data/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await approvePurchaseRequest(id));
  });
}

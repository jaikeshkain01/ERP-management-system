/**
 * GET /api/permissions — the resource × action matrix (a static app constant).
 * Any authenticated user may read it; it describes what CAN be granted, not what
 * this user HAS (that's in GET /me → permissions).
 */
import { handle, ok } from "@/lib/server/http";
import { ALL_PERMISSIONS, permissionMatrix } from "@/lib/permissions";
import { requireSession } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    await requireSession();
    return ok({ matrix: permissionMatrix(), all: ALL_PERMISSIONS });
  });
}

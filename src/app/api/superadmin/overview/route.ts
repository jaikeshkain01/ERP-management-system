/**
 * GET /api/superadmin/overview — everything the superadmin console renders in one
 * round-trip: all users (+ memberships), all companies (+ counts + module maps),
 * all roles (+ grants), plus the permission matrix and module id list the UI needs.
 * Superadmin-only (enforced by withSuperadmin inside getOverview).
 */
import { handle, ok } from "@/lib/server/http";
import { getOverview } from "@/lib/server/data/superadmin";
import { ALL_PERMISSIONS, permissionMatrix } from "@/lib/permissions";
import { MODULE_IDS } from "@/lib/server/data/modules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const overview = await getOverview();
    return ok({
      ...overview,
      permissionMatrix: permissionMatrix(),
      allPermissions: ALL_PERMISSIONS,
      moduleIds: MODULE_IDS,
    });
  });
}

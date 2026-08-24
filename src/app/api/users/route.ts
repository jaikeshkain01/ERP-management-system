/**
 * GET /api/users — list active users in the current tenant (id, name, email).
 *
 * Read-only endpoint for the small case of "pick a user from the current
 * workspace" — e.g. the custodian picker on the item add form (P8). Full user
 * management lives in Superadmin; this endpoint deliberately returns the tiny
 * subset the picker needs.
 *
 * `users` is a global table (see login route), so we filter through
 * `company_memberships` to scope the list to the caller's active company.
 */
import { withTenant, type TxClient } from "@/lib/prisma";
import { handle, ok } from "@/lib/server/http";
import { requireSession } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UserRow { id: string; name: string; email: string }

export async function GET() {
  return handle(async () => {
    const ctx = await requireSession();
    const rows = await withTenant(ctx, async (tx: TxClient) => {
      return tx.$queryRaw<UserRow[]>`
        SELECT u.id, u.name, u.email
        FROM users u
        JOIN company_memberships cm ON cm.user_id = u.id
        WHERE cm.company_id = ${ctx.companyId!}::uuid
          AND cm.status = 'active'
          AND cm.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND u.is_active = true
        ORDER BY u.name ASC`;
    });
    return ok(rows);
  });
}

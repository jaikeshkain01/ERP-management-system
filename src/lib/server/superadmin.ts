/**
 * Superadmin session glue. A superadmin (users.is_superadmin) administers users,
 * companies, roles/permissions and module licensing ACROSS every tenant.
 *
 * Cross-tenant work runs with ONLY the user GUC set (no active company): the
 * PERMISSIVE `superadmin_all` RLS policies (docs/schema.sql §RLS) grant full
 * visibility/write on the governance tables when is_superadmin() is true, which
 * it reads from the GLOBAL users table via app.current_user_id. `withUser` sets
 * exactly that context, so the transaction sees every tenant's rows.
 */
import { prisma, withUser, type TxClient } from "@/lib/prisma";
import { Errors } from "@/lib/server/http";
import { requireSession } from "@/lib/server/session";

export interface SuperadminContext {
  /** The authenticated superadmin — audit actor + created_by/updated_by. */
  userId: string;
}

/** Return the caller's context or throw 401/403 unless they are an active superadmin. */
export async function requireSuperadmin(): Promise<SuperadminContext> {
  const { userId } = await requireSession();
  // users is GLOBAL (no RLS) — read the flag directly, no tenant context needed.
  const user = await prisma.users.findFirst({
    where: { id: userId, deleted_at: null, is_active: true },
    select: { is_superadmin: true },
  });
  if (!user?.is_superadmin) throw Errors.forbidden("superadmin");
  return { userId };
}

/**
 * Run `fn` as the current superadmin inside a cross-tenant transaction. Throws
 * 403 if the caller is not a superadmin. All governance queries inside see rows
 * from every company (via the superadmin_all policies).
 */
export async function withSuperadmin<T>(
  fn: (tx: TxClient, ctx: SuperadminContext) => Promise<T>,
): Promise<T> {
  const ctx = await requireSuperadmin();
  return withUser(ctx.userId, (tx) => fn(tx, ctx));
}

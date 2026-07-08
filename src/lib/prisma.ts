import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma client for the StackIOT ERP backend.
 *
 * Connects as the least-privileged `erp_app` role (DATABASE_URL) through the
 * `pg` driver adapter — Prisma 7 has no Rust engine, so a driver adapter is
 * required. Row-Level Security is ENFORCED against this role: a plain query
 * with no tenant context set returns ZERO rows. That is the safe default —
 * always go through `withTenant()` for tenant-scoped work.
 *
 * Schema management (migrate / db pull / studio) runs as the owner via
 * DIRECT_URL — see prisma.config.ts. The running app never uses DIRECT_URL.
 */

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (see .env). Cannot initialise Prisma.");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Reuse a single client across HMR reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Transaction client handed to a `withTenant` callback. */
type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export interface TenantContext {
  /** Active company (tenant) — becomes app.current_company_id for RLS. */
  companyId: string;
  /** Authenticated user — becomes app.current_user_id (audit actor + RLS). */
  userId: string;
}

/**
 * Run `fn` inside a transaction with the tenant/user GUCs set, so Row-Level
 * Security scopes every query to `ctx.companyId` and the audit trigger stamps
 * `ctx.userId` as the actor. Mirrors docs/schema.sql:
 *
 *   SET LOCAL app.current_company_id = '<uuid>';
 *   SET LOCAL app.current_user_id    = '<uuid>';
 *
 * `set_config(name, value, is_local => true)` is the parameterised (injection-
 * safe) equivalent of SET LOCAL — the setting lives for this transaction only.
 * ALL queries must use the passed `tx`, or they run outside the context.
 */
export function withTenant<T>(
  ctx: TenantContext,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_company_id', ${ctx.companyId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${ctx.userId}, true)`;
    return fn(tx);
  });
}

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

// Reuse a single client across HMR reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (see .env). Cannot initialise Prisma.");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Lazily-initialised singleton. The client (and its pg pool) is created only on
 * first use, so in FULL MOCK MODE (isTesting) — where the DB is never queried —
 * no connection is opened and DATABASE_URL isn't required.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = (globalForPrisma.prisma ??= createClient());
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});

/** Transaction client handed to a `withTenant` / `withUser` callback. */
export type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

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

/**
 * Run `fn` with ONLY the user context set (no active company). Used during login
 * and company switching — before an active company exists — so RLS lets the user
 * read their own `company_memberships` (policy: user_id = current_user_id()) and
 * the `companies` they belong to. Tenant-scoped tables still return nothing here.
 */
export function withUser<T>(userId: string, fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return fn(tx);
  });
}

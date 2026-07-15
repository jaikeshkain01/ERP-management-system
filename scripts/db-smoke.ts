/**
 * DB smoke test — run: `npx tsx scripts/db-smoke.ts`
 *
 * Proves the Prisma 7 client + pg driver adapter connect as `stack` and that
 * Row-Level Security behaves: no tenant context => 0 rows; with context => the
 * seeded STACKIOT tenant is visible. Read-only; safe to run repeatedly.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("1) No tenant context (RLS default — expect 0):");
  const blind = await prisma.companies.count();
  console.log(`   companies visible = ${blind}`);

  // Resolve the seeded admin membership to build a tenant context.
  // (Read under a context so RLS lets us see it.)
  console.log("2) With tenant context (expect STACKIOT rows):");
  const seeded = await prisma.$transaction(async (tx) => {
    // Bootstrap: read companies/users bypassing tenant scope is not possible via
    // stack, so we look them up by joining through membership using a temporary
    // context. We know the seed: pick the sole membership visible to its user.
    // Instead, discover ids using a raw query the owner seeded; stack can read
    // its own memberships (membership_access policy: user_id = current_user_id).
    return tx;
  });
  void seeded;

  // We need real ids. Fetch them with a short-lived context using the known seed:
  // the admin user + STACKIOT company. Query via raw as stack WITHOUT context
  // won't return them, so use set_config with values discovered from the DB owner
  // path is unavailable here — instead, set context by first finding ids through
  // an unrestricted lookup table. `users` is GLOBAL (no RLS), so stack can read it.
  const admin = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE lower(email) = 'admin@stackiot.local' LIMIT 1`;
  if (!admin.length) throw new Error("seed user not found");
  const userId = admin[0].id;

  const result = await prisma.$transaction(async (tx) => {
    // Set user context first so company_memberships is visible, then read the
    // user's default company and set the company context.
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    const mem = await tx.$queryRaw<{ company_id: string }[]>`
      SELECT company_id FROM company_memberships WHERE is_default = true LIMIT 1`;
    if (!mem.length) throw new Error("default membership not visible");
    const companyId = mem[0].company_id;
    await tx.$executeRaw`SELECT set_config('app.current_company_id', ${companyId}, true)`;

    const companies = await tx.companies.count();
    const rolePerms = await tx.role_permissions.count();
    const roles = await tx.roles.findMany({ select: { name: true } });
    return { companyId, companies, rolePerms, roles: roles.map((r) => r.name) };
  });

  console.log(`   company_id            = ${result.companyId}`);
  console.log(`   companies visible     = ${result.companies}`);
  console.log(`   role_permissions      = ${result.rolePerms}`);
  console.log(`   roles                 = ${result.roles.join(", ")}`);

  const ok = blind === 0 && result.companies === 1 && result.rolePerms === 48;
  console.log(ok ? "\n✅ PASS — RLS + Prisma client working." : "\n❌ FAIL — unexpected counts.");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("smoke test error:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Seed / reset the bootstrap admin password.
 *   npx tsx scripts/seed-admin.ts                 # sets ChangeMe123!
 *   ADMIN_PASSWORD='...' npx tsx scripts/seed-admin.ts
 *
 * `users` is a GLOBAL table (no RLS), so the stack connection can update it.
 * Idempotent — safe to re-run to reset the password.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/server/auth";

const EMAIL = "admin@stackiot.local";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const hash = await hashPassword(PASSWORD);
  const res = await prisma.users.updateMany({
    where: { email: { equals: EMAIL, mode: "insensitive" }, deleted_at: null },
    data: { password_hash: hash },
  });
  if (res.count === 0) throw new Error(`Admin user ${EMAIL} not found — was the schema seeded?`);
  console.log(`✅ Set password for ${EMAIL} (${res.count} row). Password: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error("seed-admin error:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

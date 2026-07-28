/**
 * Clear sample inventory balances and opening transactions from the database.
 * Run with: npx tsx scripts/clear-inventory.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

if (!process.env.DIRECT_URL) {
  throw new Error("DIRECT_URL is not set in environment.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }),
});

async function main() {
  const deletedTxns = await prisma.$executeRaw`DELETE FROM inventory_transactions`;
  const deletedBalances = await prisma.$executeRaw`DELETE FROM inventory_balances`;

  console.log(`✅ Cleared ${deletedTxns} inventory transactions.`);
  console.log(`✅ Cleared ${deletedBalances} inventory balance rows.`);
  console.log("Inventory balance reset to 0.");
}

main()
  .catch((err) => {
    console.error("Error clearing inventory:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

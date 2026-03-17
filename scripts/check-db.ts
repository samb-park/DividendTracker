import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const holdings = await prisma.holding.findMany({
    include: {
      portfolio: true,
      transactions: true,
    },
    orderBy: [{ portfolio: { name: "asc" } }, { ticker: "asc" }],
  });

  console.log("\n=== HOLDINGS STATUS ===\n");
  console.log(
    "Portfolio".padEnd(20),
    "Ticker".padEnd(12),
    "Currency".padEnd(8),
    "DB qty".padEnd(14),
    "DB avgCost".padEnd(14),
    "Txn Bought".padEnd(12),
    "Txn Sold".padEnd(12),
    "Txn Shares".padEnd(12),
  );
  console.log("-".repeat(120));

  for (const h of holdings) {
    const buys = h.transactions.filter((t) => t.action === "BUY");
    const sells = h.transactions.filter((t) => t.action === "SELL");
    const totalBought = buys.reduce((s, t) => s + Number(t.quantity), 0);
    const totalSold = sells.reduce((s, t) => s + Number(t.quantity), 0);
    const txnShares = totalBought - totalSold;

    console.log(
      h.portfolio.name.padEnd(20),
      h.ticker.padEnd(12),
      h.currency.padEnd(8),
      (h.quantity?.toString() ?? "null").padEnd(14),
      (h.avgCost?.toString() ?? "null").padEnd(14),
      totalBought.toFixed(2).padEnd(12),
      totalSold.toFixed(2).padEnd(12),
      txnShares.toFixed(2).padEnd(12),
    );
  }

  // Check for TLT specifically
  const tlt = holdings.filter((h) => h.ticker.includes("TLT"));
  if (tlt.length > 0) {
    console.log("\n=== TLT ENTRIES ===");
    for (const h of tlt) {
      console.log(`  Portfolio: ${h.portfolio.name}, quantity: ${h.quantity}, txn count: ${h.transactions.length}`);
    }
  }

  // Check last sync time
  const lastSync = await prisma.setting.findUnique({ where: { key: "qt_last_sync" } });
  console.log(`\nLast sync: ${lastSync?.value ?? "never"}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

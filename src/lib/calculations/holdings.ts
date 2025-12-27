import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";

interface HoldingCalculation {
  ticker: string;
  quantity: Decimal;
  totalCost: Decimal;
  avgCost: Decimal;
}

export async function calculateHoldingsForAccount(accountId: string) {
  const transactions = await prisma.transaction.findMany({
    where: { accountId },
    orderBy: { tradeDate: "asc" },
  });

  const holdings = new Map<string, HoldingCalculation>();

  for (const tx of transactions) {
    const ticker = tx.ticker;
    let holding = holdings.get(ticker) || {
      ticker,
      quantity: new Decimal(0),
      totalCost: new Decimal(0),
      avgCost: new Decimal(0),
    };

    const qty = new Decimal(tx.quantity.toString());
    const price = new Decimal(tx.price.toString());
    const fee = new Decimal(tx.fee.toString());

    switch (tx.type) {
      case "BUY":
      case "TRANSFER_IN":
      case "DIVIDEND_DRIP":
        // Add to position
        const buyCost = qty.mul(price).add(fee);
        holding.totalCost = holding.totalCost.add(buyCost);
        holding.quantity = holding.quantity.add(qty);
        break;

      case "SELL":
      case "TRANSFER_OUT":
        // Reduce position proportionally
        if (holding.quantity.gt(0)) {
          const fraction = qty.div(holding.quantity);
          holding.totalCost = holding.totalCost.mul(new Decimal(1).sub(fraction));
          holding.quantity = holding.quantity.sub(qty);
        }
        break;

      case "SPLIT":
        // qty represents split ratio (e.g., 4 for 4:1 split)
        holding.quantity = holding.quantity.mul(qty);
        // avgCost per share decreases proportionally (totalCost unchanged)
        break;

      case "DIVIDEND_CASH":
        // No effect on holdings (cash dividend)
        break;
    }

    // Recalculate average cost
    if (holding.quantity.gt(0)) {
      holding.avgCost = holding.totalCost.div(holding.quantity);
    } else {
      holding.avgCost = new Decimal(0);
      holding.totalCost = new Decimal(0);
    }

    holdings.set(ticker, holding);
  }

  // Filter out zero or negligible positions
  return Array.from(holdings.values()).filter((h) => h.quantity.gt(0.0001));
}

export async function syncHoldingsForAccount(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { currency: true },
  });

  if (!account) throw new Error("Account not found");

  const calculated = await calculateHoldingsForAccount(accountId);

  // Use transaction to update holdings atomically
  await prisma.$transaction(async (tx) => {
    // Delete existing holdings for account
    await tx.holding.deleteMany({ where: { accountId } });

    // Insert new holdings
    if (calculated.length > 0) {
      await tx.holding.createMany({
        data: calculated.map((h) => ({
          accountId,
          ticker: h.ticker,
          quantity: new Prisma.Decimal(h.quantity.toFixed(8)),
          avgCost: new Prisma.Decimal(h.avgCost.toFixed(6)),
          currency: account.currency,
        })),
      });
    }
  });

  return calculated;
}

export async function syncAllHoldings() {
  const accounts = await prisma.account.findMany({ select: { id: true } });

  for (const account of accounts) {
    await syncHoldingsForAccount(account.id);
  }
}

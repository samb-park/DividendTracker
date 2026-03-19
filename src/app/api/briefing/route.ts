import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPrice } from "@/lib/price";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const portfolios = await prisma.portfolio.findMany({
    where: { userId: session.user.id },
    include: {
      holdings: {
        include: { transactions: true },
      },
    },
  });

  let totalValue = 0;
  let totalCostBasis = 0;

  const portfolioData = await Promise.all(
    portfolios.map(async (portfolio) => {
      const holdingsData = await Promise.all(
        portfolio.holdings.map(async (holding) => {
          const buys = holding.transactions.filter((t) => t.action === "BUY");
          const sells = holding.transactions.filter((t) => t.action === "SELL");

          const totalBought = buys.reduce((s, t) => s + Number(t.quantity), 0);
          const totalSold = sells.reduce((s, t) => s + Number(t.quantity), 0);
          const shares = totalBought - totalSold;

          if (shares <= 0) return null;

          const totalCost = buys.reduce(
            (s, t) => s + Number(t.quantity) * Number(t.price) + Number(t.commission),
            0
          );
          const avgCost = totalBought > 0 ? totalCost / totalBought : 0;
          const costBasis = avgCost * shares;

          const price = await getPrice(holding.ticker);
          if (!price) return null;

          const marketValue = shares * price.price;
          const unrealizedPnL = marketValue - costBasis;
          const unrealizedPnLPct = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

          totalValue += marketValue;
          totalCostBasis += costBasis;

          return {
            ticker: holding.ticker,
            name: holding.name || holding.ticker,
            shares,
            avgCost,
            currentPrice: price.price,
            dayChange: price.change,
            dayChangePct: price.changePercent,
            week52High: price.week52High,
            week52Low: price.week52Low,
            fromHighPct: price.fromHighPct,
            fromLowPct: price.fromLowPct,
            marketValue,
            costBasis,
            unrealizedPnL,
            unrealizedPnLPct,
          };
        })
      );

      return {
        name: portfolio.name,
        holdings: holdingsData.filter(Boolean),
      };
    })
  );

  const totalPnL = totalValue - totalCostBasis;
  const totalPnLPct = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;

  return NextResponse.json({
    date: new Date().toISOString().split("T")[0],
    totalValue,
    totalCostBasis,
    totalPnL,
    totalPnLPct,
    portfolios: portfolioData,
  });
}

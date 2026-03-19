import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { yahooFinance } from "@/lib/price";

export const dynamic = "force-dynamic";

async function getFxRate(): Promise<number> {
  try {
    const q = await yahooFinance.quote("USDCAD=X", { fields: ["regularMarketPrice"] });
    return q.regularMarketPrice ?? parseFloat(process.env.DEFAULT_FX_RATE ?? "1.35");
  } catch {
    return parseFloat(process.env.DEFAULT_FX_RATE ?? "1.35");
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [users, fxRate] = await Promise.all([
    prisma.user.findMany({
      where: { approved: true },
      select: { id: true },
    }),
    getFxRate(),
  ]);

  // Collect all unique tickers across all users upfront
  const allHoldings = await prisma.holding.findMany({
    where: {
      portfolio: { userId: { in: users.map((u) => u.id) } },
      quantity: { gt: 0 },
    },
    select: { ticker: true, currency: true },
  });

  const uniqueTickers = [...new Set(allHoldings.map((h) => h.ticker))];

  // Fetch all prices in parallel — local Map, no module-level state
  const priceCache = new Map<string, number>();
  await Promise.all(
    uniqueTickers.map(async (ticker) => {
      try {
        const quote = await yahooFinance.quote(ticker, { fields: ["regularMarketPrice"] });
        const price = quote.regularMarketPrice ?? null;
        if (price) priceCache.set(ticker, price);
      } catch {
        // skip tickers that fail
      }
    })
  );

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const results = await Promise.all(
    users.map(async (user) => {
      try {
        const portfolios = await prisma.portfolio.findMany({
          where: { userId: user.id },
          include: { holdings: true },
        });

        let totalCAD = 0;
        let costBasisCAD = 0;
        let cashCAD = 0;

        for (const p of portfolios) {
          cashCAD += parseFloat(p.cashCAD?.toString() ?? "0") || 0;
          cashCAD += (parseFloat(p.cashUSD?.toString() ?? "0") || 0) * fxRate;

          for (const h of p.holdings) {
            const qty = parseFloat(h.quantity?.toString() ?? "0") || 0;
            if (qty <= 0) continue;

            const price = priceCache.get(h.ticker);
            if (!price) continue;

            const mktValue = qty * price;
            const mktValueCAD = h.currency === "USD" ? mktValue * fxRate : mktValue;
            totalCAD += mktValueCAD;

            const avgCost = parseFloat(h.avgCost?.toString() ?? "0") || 0;
            const costCAD = qty * avgCost;
            costBasisCAD += h.currency === "USD" ? costCAD * fxRate : costCAD;
          }
        }

        await prisma.portfolioSnapshot.upsert({
          where: { userId_date: { userId: user.id, date: today } },
          update: { totalCAD: totalCAD + cashCAD, costBasisCAD, cashCAD },
          create: { userId: user.id, date: today, totalCAD: totalCAD + cashCAD, costBasisCAD, cashCAD },
        });

        return {
          userId: user.id,
          totalCAD: (totalCAD + cashCAD).toFixed(2),
          costBasisCAD: costBasisCAD.toFixed(2),
          cashCAD: cashCAD.toFixed(2),
        };
      } catch (e: unknown) {
        return {
          userId: user.id,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    })
  );

  return NextResponse.json({
    ok: true,
    date: today.toISOString().slice(0, 10),
    users: results,
  });
}

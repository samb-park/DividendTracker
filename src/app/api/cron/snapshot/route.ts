import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

const yf = new YahooFinance();

// Price cache (reuse within a single cron run)
const priceCache = new Map<string, number>();

async function getPrice(ticker: string): Promise<number | null> {
  if (priceCache.has(ticker)) return priceCache.get(ticker)!;
  try {
    const quote = await yf.quote(ticker, { fields: ["regularMarketPrice"] });
    const price = quote.regularMarketPrice ?? null;
    if (price) priceCache.set(ticker, price);
    return price;
  } catch {
    return null;
  }
}

async function getFxRate(): Promise<number> {
  try {
    const q = await yf.quote("USDCAD=X", { fields: ["regularMarketPrice"] });
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

  priceCache.clear();

  const [portfolios, fxRate] = await Promise.all([
    prisma.portfolio.findMany({
      include: { holdings: { include: { transactions: true } } },
    }),
    getFxRate(),
  ]);

  let totalCAD = 0;
  let costBasisCAD = 0;
  let cashCAD = 0;

  for (const p of portfolios) {
    cashCAD += parseFloat(p.cashCAD?.toString() ?? "0") || 0;
    cashCAD += (parseFloat(p.cashUSD?.toString() ?? "0") || 0) * fxRate;

    for (const h of p.holdings) {
      const qty = parseFloat(h.quantity?.toString() ?? "0") || 0;
      if (qty <= 0) continue;

      const price = await getPrice(h.ticker);
      if (!price) continue;

      const mktValue = qty * price;
      const mktValueCAD = h.currency === "USD" ? mktValue * fxRate : mktValue;
      totalCAD += mktValueCAD;

      const avgCost = parseFloat(h.avgCost?.toString() ?? "0") || 0;
      const costCAD = qty * avgCost;
      costBasisCAD += h.currency === "USD" ? costCAD * fxRate : costCAD;
    }
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.portfolioSnapshot.upsert({
    where: { date: today },
    update: { totalCAD: totalCAD + cashCAD, costBasisCAD, cashCAD },
    create: { date: today, totalCAD: totalCAD + cashCAD, costBasisCAD, cashCAD },
  });

  return NextResponse.json({
    ok: true,
    date: today.toISOString().slice(0, 10),
    totalCAD: (totalCAD + cashCAD).toFixed(2),
    costBasisCAD: costBasisCAD.toFixed(2),
    cashCAD: cashCAD.toFixed(2),
  });
}

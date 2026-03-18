import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

const yf = new YahooFinance();
const cache = new Map<string, { sector: string; fetchedAt: number }>();
const TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getSector(ticker: string): Promise<string> {
  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < TTL) return cached.sector;

  try {
    const result = await yf.quoteSummary(ticker, { modules: ["assetProfile"] });
    const sector = (result.assetProfile as { sector?: string })?.sector ?? "Other";
    cache.set(ticker, { sector, fetchedAt: Date.now() });
    return sector;
  } catch {
    return "Other";
  }
}

export async function GET() {
  const holdings = await prisma.holding.findMany({
    where: { quantity: { gt: 0 } },
    select: { ticker: true },
    distinct: ["ticker"],
  });

  const results = await Promise.all(
    holdings.map(async (h) => ({
      ticker: h.ticker,
      sector: await getSector(h.ticker),
    }))
  );

  return NextResponse.json({ sectors: results });
}

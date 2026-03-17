import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCompanyName } from "@/lib/price";

export async function POST(req: NextRequest) {
  const { portfolioId, ticker, currency } = await req.json();
  if (!portfolioId || !ticker) {
    return NextResponse.json({ error: "portfolioId and ticker required" }, { status: 400 });
  }
  const upperTicker = ticker.trim().toUpperCase();
  const name = await getCompanyName(upperTicker);

  const holding = await prisma.holding.upsert({
    where: { portfolioId_ticker: { portfolioId, ticker: upperTicker } },
    update: {},
    create: {
      portfolioId,
      ticker: upperTicker,
      name,
      currency: currency ?? "USD",
    },
  });
  return NextResponse.json(holding);
}

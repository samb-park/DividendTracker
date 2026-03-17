import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPrice } from "@/lib/price";

export async function POST(req: NextRequest) {
  const { portfolioId, ticker } = await req.json();
  if (!portfolioId || !ticker) {
    return NextResponse.json({ error: "portfolioId and ticker required" }, { status: 400 });
  }
  const upperTicker = ticker.trim().toUpperCase();
  const priceData = await getPrice(upperTicker);
  if (!priceData) {
    return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
  }
  const currency = priceData.currency === "CAD" ? "CAD" : "USD";

  const holding = await prisma.holding.upsert({
    where: { portfolioId_ticker: { portfolioId, ticker: upperTicker } },
    update: {},
    create: {
      portfolioId,
      ticker: upperTicker,
      name: priceData.name,
      currency,
    },
  });
  return NextResponse.json(holding);
}

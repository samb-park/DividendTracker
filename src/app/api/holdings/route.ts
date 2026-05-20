import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPrice } from "@/lib/price";
import { auth } from "@/auth";

const LEGACY_INCOME_TICKER = ["JE", "PQ"].join("");

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { portfolioId, ticker } = await req.json();
  if (!portfolioId || !ticker) {
    return NextResponse.json({ error: "portfolioId and ticker required" }, { status: 400 });
  }

  // Verify portfolio belongs to current user
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId, userId: session.user.id },
    select: { id: true },
  });
  if (!portfolio) return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });

  const upperTicker = ticker.trim().toUpperCase();
  if (upperTicker === LEGACY_INCOME_TICKER) {
    return NextResponse.json(
      { error: "Rulebook v4.4.2 violation: income slot ticker is QQQI only" },
      { status: 422 },
    );
  }
  const priceData = await getPrice(upperTicker);
  if (!priceData) {
    return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
  }
  const currency = priceData.currency === "CAD" ? "CAD" : "USD";

  const holding = await prisma.holding.upsert({
    where: { portfolioId_ticker: { portfolioId, ticker: upperTicker } },
    update: { isActive: true },
    create: {
      portfolioId,
      ticker: upperTicker,
      name: priceData.name,
      currency,
      isActive: true,
    },
  });
  return NextResponse.json(holding);
}

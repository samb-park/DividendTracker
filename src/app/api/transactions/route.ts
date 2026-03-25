import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getFxRate } from "@/lib/price";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const holdingId = searchParams.get("holdingId");
  const holdingIds = searchParams.get("holdingIds")?.split(",").filter(Boolean);

  const transactions = await prisma.transaction.findMany({
    where: {
      ...(holdingIds && holdingIds.length > 0
        ? { holdingId: { in: holdingIds } }
        : holdingId ? { holdingId } : {}),
      holding: { portfolio: { userId: session.user.id } },
    },
    orderBy: { date: "desc" },
    include: { holding: { include: { portfolio: true } } },
  });
  return NextResponse.json(transactions);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { action, date, quantity, price, commission, notes } = body;
  if (!action || !date || !quantity || !price) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["BUY", "SELL", "DIVIDEND"].includes(action as string)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  let resolvedHoldingId: string;
  let holdingCurrency: "USD" | "CAD";

  if (body.holdingId) {
    // Existing flow: holdingId provided directly
    const holding = await prisma.holding.findUnique({
      where: { id: body.holdingId as string },
      select: { id: true, currency: true, portfolio: { select: { userId: true } } },
    });
    if (!holding || holding.portfolio.userId !== session.user.id) {
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }
    resolvedHoldingId = holding.id;
    holdingCurrency = holding.currency as "USD" | "CAD";
  } else if (body.portfolioId && body.ticker) {
    // New flow: portfolioId + ticker — verify portfolio ownership, upsert holding
    const ticker = String(body.ticker).toUpperCase().trim();
    if (!ticker) {
      return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
    }
    const portfolio = await prisma.portfolio.findUnique({
      where: { id: body.portfolioId as string },
      select: { userId: true },
    });
    if (!portfolio || portfolio.userId !== session.user.id) {
      return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
    }
    const currency: "USD" | "CAD" = ticker.endsWith(".TO") ? "CAD" : "USD";
    const upserted = await prisma.holding.upsert({
      where: { portfolioId_ticker: { portfolioId: body.portfolioId as string, ticker } },
      update: {},
      create: { portfolioId: body.portfolioId as string, ticker, currency },
      select: { id: true, currency: true },
    });
    resolvedHoldingId = upserted.id;
    holdingCurrency = upserted.currency as "USD" | "CAD";
  } else {
    return NextResponse.json({ error: "Must provide holdingId or portfolioId + ticker" }, { status: 400 });
  }

  const qty = Number(quantity);
  const prc = Number(price);
  const com = Number(commission ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "quantity must be a positive number" }, { status: 400 });
  }
  if (!Number.isFinite(prc) || prc <= 0) {
    return NextResponse.json({ error: "price must be a positive number" }, { status: 400 });
  }
  if (!Number.isFinite(com) || com < 0) {
    return NextResponse.json({ error: "commission must be non-negative" }, { status: 400 });
  }
  const txDate = new Date(date as string);
  if (isNaN(txDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (txDate > new Date()) {
    return NextResponse.json({ error: "Transaction date cannot be in the future" }, { status: 400 });
  }
  // For USD holdings, capture the CAD/USD rate at time of entry for CRA reporting
  let fxRateCAD: number | null = null;
  if (holdingCurrency === "USD") {
    const fx = await getFxRate().catch(() => null);
    fxRateCAD = fx?.rate ?? null;
  }

  const tx = await prisma.transaction.create({
    data: {
      holdingId: resolvedHoldingId,
      action: action as "BUY" | "SELL" | "DIVIDEND",
      date: txDate,
      quantity: qty,
      price: prc,
      commission: com,
      fxRateCAD,
      notes: notes ? String(notes).slice(0, 500) : null,
    },
  });
  return NextResponse.json(tx);
}

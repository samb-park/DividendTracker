import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const userId = session.user.id;

  if (searchParams.get("all") === "true") {
    const txns = await prisma.cashTransaction.findMany({
      where: { portfolio: { userId } },
      select: { date: true, action: true, amount: true, currency: true },
      orderBy: { date: "asc" },
    });
    const items = txns.map((t) => ({
      date: t.date.toISOString().slice(0, 10),
      action: t.action as "DEPOSIT" | "WITHDRAWAL",
      amount: parseFloat(t.amount.toString()),
      currency: t.currency as "CAD" | "USD",
    }));
    return NextResponse.json({ items });
  }

  const year = parseInt(searchParams.get("year") ?? new Date().getFullYear().toString(), 10);
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const [txns, allTxns] = await Promise.all([
    prisma.cashTransaction.findMany({
      where: { portfolio: { userId }, date: { gte: start, lt: end } },
      orderBy: { date: "desc" },
      include: { portfolio: true },
    }),
    prisma.cashTransaction.findMany({
      where: { portfolio: { userId } },
      select: { date: true },
    }),
  ]);

  const yearSet = new Set(allTxns.map((t) => t.date.getFullYear()));
  yearSet.add(new Date().getFullYear());
  const years = Array.from(yearSet).sort((a, b) => b - a);

  const items = txns.map((t) => ({
    id: t.id,
    date: t.date.toISOString().slice(0, 10),
    portfolioId: t.portfolioId,
    portfolioName: t.portfolio.name,
    portfolioAccountType: t.portfolio.accountType,
    action: t.action,
    amount: parseFloat(t.amount.toString()),
    currency: t.currency as "CAD" | "USD",
    notes: t.notes,
  }));

  return NextResponse.json({ items, years });
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
  const { portfolioId, action, date, amount, currency, notes } = body;
  if (!portfolioId || !action || !date || !amount || !currency) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["DEPOSIT", "WITHDRAWAL"].includes(action as string)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (!["CAD", "USD"].includes(currency as string)) {
    return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  const txDate = new Date(date as string);
  if (isNaN(txDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  // Verify portfolio belongs to current user
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId as string, userId: session.user.id },
    select: { id: true },
  });
  if (!portfolio) return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });

  const tx = await prisma.cashTransaction.create({
    data: {
      portfolioId: portfolioId as string,
      action: action as "DEPOSIT" | "WITHDRAWAL",
      date: txDate,
      amount: amt,
      currency: currency as "CAD" | "USD",
      notes: notes ? String(notes).slice(0, 500) : null,
    },
  });
  return NextResponse.json(tx);
}

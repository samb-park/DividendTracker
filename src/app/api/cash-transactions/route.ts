import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? new Date().getFullYear().toString(), 10);

  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const [txns, allTxns] = await Promise.all([
    prisma.cashTransaction.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: "desc" },
      include: { portfolio: true },
    }),
    prisma.cashTransaction.findMany({ select: { date: true } }),
  ]);

  const yearSet = new Set(allTxns.map((t) => t.date.getFullYear()));
  yearSet.add(new Date().getFullYear());
  const years = Array.from(yearSet).sort((a, b) => b - a);

  const items = txns.map((t) => ({
    id: t.id,
    date: t.date.toISOString().slice(0, 10),
    portfolioId: t.portfolioId,
    portfolioName: t.portfolio.name,
    action: t.action,
    amount: parseFloat(t.amount.toString()),
    currency: t.currency as "CAD" | "USD",
    notes: t.notes,
  }));

  return NextResponse.json({ items, years });
}

export async function POST(req: NextRequest) {
  const { portfolioId, action, date, amount, currency, notes } = await req.json();
  if (!portfolioId || !action || !date || !amount || !currency) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const tx = await prisma.cashTransaction.create({
    data: {
      portfolioId,
      action,
      date: new Date(date),
      amount,
      currency,
      notes: notes ?? null,
    },
  });
  return NextResponse.json(tx);
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const rawYear = searchParams.get("year") ?? String(new Date().getFullYear());
  const yearNum = parseInt(rawYear, 10);
  if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }
  const year = String(yearNum);

  const txns = await prisma.transaction.findMany({
    where: {
      action: "DIVIDEND",
      date: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${yearNum + 1}-01-01`),
      },
    },
    orderBy: { date: "asc" },
    include: { holding: { include: { portfolio: true } } },
  });

  const rows = [
    ["Date", "Portfolio", "Ticker", "Currency", "Amount", "Notes"],
    ...txns.map((t) => [
      t.date.toISOString().slice(0, 10),
      t.holding.portfolio.name,
      t.holding.ticker,
      t.holding.currency,
      (parseFloat(t.price.toString()) * parseFloat(t.quantity.toString())).toFixed(2),
      t.notes ?? "",
    ]),
  ];

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dividends-${year}.csv"`,
    },
  });
}

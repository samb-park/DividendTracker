import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year") ?? new Date().getFullYear().toString();

  const txns = await prisma.transaction.findMany({
    where: {
      action: "DIVIDEND",
      date: {
        gte: new Date(`${year}-01-01`),
        lte: new Date(`${year}-12-31T23:59:59`),
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
      t.price,
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

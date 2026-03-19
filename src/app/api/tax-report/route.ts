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
      holding: { portfolio: { userId: session.user.id } },
    },
    orderBy: { date: "asc" },
    include: { holding: { include: { portfolio: true } } },
  });

  const DEFAULT_FX = parseFloat(process.env.DEFAULT_FX_RATE ?? "1.36");

  const rows = [
    ["Date", "Portfolio", "Account Type", "Ticker", "Currency", "Amount", "FX Rate (CAD/USD)", "Amount (CAD)", "Notes"],
    ...txns.map((t) => {
      const amount = parseFloat(t.price.toString()) * parseFloat(t.quantity.toString());
      const isUSD = t.holding.currency === "USD";
      const fxRate = t.fxRateCAD ? parseFloat(t.fxRateCAD.toString()) : DEFAULT_FX;
      const amountCAD = isUSD ? (amount * fxRate).toFixed(2) : amount.toFixed(2);
      return [
        t.date.toISOString().slice(0, 10),
        t.holding.portfolio.name,
        t.holding.portfolio.accountType,
        t.holding.ticker,
        t.holding.currency,
        amount.toFixed(2),
        isUSD ? fxRate.toFixed(6) : "",
        amountCAD,
        t.notes ?? "",
      ];
    }),
  ];

  // Sanitize cells: escape quotes and strip leading formula chars (=, +, -, @) to prevent CSV injection
  const sanitize = (cell: string) => {
    const s = String(cell).replace(/"/g, '""');
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  };
  const csv = rows
    .map((row) => row.map((cell) => `"${sanitize(cell)}"`).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dividends-${year}.csv"`,
    },
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPrice } from "@/lib/price";
import { getNasdaqDividend } from "@/lib/nasdaq-dividend";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const holdings = await prisma.holding.findMany({
    where: {
      portfolio: { userId: session.user.id },
      quantity: { gt: 0 },
    },
    select: { ticker: true, quantity: true, currency: true },
  });

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);
  const in30Str = in30.toISOString().split("T")[0];

  // Aggregate shares per ticker
  const sharesByTicker: Record<string, { shares: number; currency: "USD" | "CAD" }> = {};
  for (const h of holdings) {
    const qty = parseFloat(h.quantity?.toString() ?? "0") || 0;
    if (qty <= 0) continue;
    if (!sharesByTicker[h.ticker]) {
      sharesByTicker[h.ticker] = { shares: 0, currency: h.currency as "USD" | "CAD" };
    }
    sharesByTicker[h.ticker].shares += qty;
  }

  const upcoming: {
    ticker: string;
    exDivDate: string;
    estimatedPayDate: string | null;
    annualDividendRate: number | null;
    shares: number;
    currency: "USD" | "CAD";
  }[] = [];

  for (const [ticker, { shares, currency }] of Object.entries(sharesByTicker)) {
    try {
      // Primary: dividendhistory.org
      const dh = await getNasdaqDividend(ticker);
      let exDiv: string | null = dh?.exDividendDate ?? null;
      let payDate: string | null = dh?.paymentDate ?? null;

      // Fallback: Yahoo Finance quote
      if (!exDiv) {
        const price = await getPrice(ticker);
        exDiv = price?.exDividendDate ?? null;
        payDate = price?.dividendDate ?? null;
      }

      if (!exDiv) continue;
      if (exDiv < todayStr || exDiv > in30Str) continue;

      const price = await getPrice(ticker);
      const annualDividendRate = price?.trailingAnnualDividendRate ?? price?.dividendRate ?? null;

      upcoming.push({
        ticker,
        exDivDate: exDiv,
        estimatedPayDate: payDate,
        annualDividendRate,
        shares,
        currency,
      });
    } catch {
      // skip
    }
  }

  upcoming.sort((a, b) => a.exDivDate.localeCompare(b.exDivDate));
  return NextResponse.json({ upcoming });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const rawRange = searchParams.get("range") ?? "1y";
  const VALID_RANGES = ["3m", "6m", "1y", "all"] as const;
  type Range = typeof VALID_RANGES[number];
  if (!VALID_RANGES.includes(rawRange as Range)) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }
  const range = rawRange as Range;

  const now = new Date();
  let since: Date | undefined;

  if (range === "3m") {
    since = new Date(now);
    since.setMonth(since.getMonth() - 3);
  } else if (range === "6m") {
    since = new Date(now);
    since.setMonth(since.getMonth() - 6);
  } else if (range === "1y") {
    since = new Date(now);
    since.setFullYear(since.getFullYear() - 1);
  }

  const [snapshots, dividendTxns] = await Promise.all([
    prisma.portfolioSnapshot.findMany({
      where: {
        userId: session.user.id,
        ...(since ? { date: { gte: since } } : {}),
      },
      orderBy: { date: "asc" },
      select: { date: true, totalCAD: true, costBasisCAD: true, cashCAD: true },
    }),
    prisma.transaction.findMany({
      where: {
        action: "DIVIDEND",
        holding: { portfolio: { userId: session.user.id } },
        ...(since ? { date: { gte: since } } : {}),
      },
      orderBy: { date: "asc" },
      select: { date: true, price: true, quantity: true, holding: { select: { currency: true } } },
    }),
  ]);

  // Compute cumulative dividend income in CAD (approx 1.35 for USD→CAD)
  const FX_FALLBACK = 1.35;
  let cumDiv = 0;
  let divIdx = 0;

  const data = snapshots.map((s) => {
    const snapshotDate = s.date.toISOString().slice(0, 10);
    while (divIdx < dividendTxns.length) {
      const t = dividendTxns[divIdx];
      const txnDate = t.date.toISOString().slice(0, 10);
      if (txnDate <= snapshotDate) {
        const amount = parseFloat(t.price.toString()) * parseFloat(t.quantity.toString());
        const inCAD = t.holding.currency === "USD" ? amount * FX_FALLBACK : amount;
        cumDiv += inCAD;
        divIdx++;
      } else {
        break;
      }
    }
    return {
      date: snapshotDate,
      totalCAD: parseFloat(s.totalCAD.toString()),
      costBasisCAD: parseFloat(s.costBasisCAD.toString()),
      cashCAD: parseFloat(s.cashCAD.toString()),
      cumulativeDividendCAD: Math.round(cumDiv * 100) / 100,
    };
  });

  return NextResponse.json({ snapshots: data });
}

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

  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: {
      userId: session.user.id,
      ...(since ? { date: { gte: since } } : {}),
    },
    orderBy: { date: "asc" },
    select: { date: true, totalCAD: true, costBasisCAD: true, cashCAD: true },
  });

  const data = snapshots.map((s) => ({
    date: s.date.toISOString().slice(0, 10),
    totalCAD: parseFloat(s.totalCAD.toString()),
    costBasisCAD: parseFloat(s.costBasisCAD.toString()),
    cashCAD: parseFloat(s.cashCAD.toString()),
  }));

  return NextResponse.json({ snapshots: data });
}

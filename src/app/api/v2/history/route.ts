import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const VALID_RANGES = ["1m", "3m", "6m", "1y", "all"] as const;
type Range = (typeof VALID_RANGES)[number];

function toNum(d: unknown): number {
  if (d === null || d === undefined) return 0;
  if (typeof d === "number") return d;
  const s = typeof d === "string" ? d : (d as { toString(): string }).toString();
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const uid = session.user.id;

  const { searchParams } = new URL(req.url);
  const rawRange = searchParams.get("range") ?? "3m";
  const range = (VALID_RANGES.includes(rawRange as Range) ? rawRange : "3m") as Range;

  const now = new Date();
  let since: Date | undefined;
  if (range === "1m") {
    since = new Date(now);
    since.setMonth(since.getMonth() - 1);
  } else if (range === "3m") {
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
      userId: uid,
      ...(since ? { date: { gte: since } } : {}),
    },
    orderBy: { date: "asc" },
    select: { date: true, totalCAD: true, costBasisCAD: true, cashCAD: true },
  });

  const series = snapshots.map((s) => ({
    date: s.date.toISOString().slice(0, 10),
    totalCAD: toNum(s.totalCAD),
    costBasisCAD: toNum(s.costBasisCAD),
    cashCAD: toNum(s.cashCAD),
  }));

  return NextResponse.json({
    range,
    series,
    isEmpty: series.length === 0,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") ?? "1y"; // 3m | 6m | 1y | all

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
    where: since ? { date: { gte: since } } : undefined,
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

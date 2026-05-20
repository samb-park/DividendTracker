import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getFxRate } from "@/lib/price";
import {
  V2GraphClient,
  type V2GraphPoint,
} from "@/components/v2/v2-graph-client";

export const dynamic = "force-dynamic";

function toNum(d: unknown): number {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  const n = parseFloat(typeof d === "string" ? d : (d as { toString(): string }).toString());
  return isFinite(n) ? n : 0;
}

export default async function V2GraphPage() {
  const session = await auth();
  const uid = session.user.id;

  const since = new Date();
  since.setMonth(since.getMonth() - 3);

  const [snapshots, fx] = await Promise.all([
    prisma.portfolioSnapshot.findMany({
      where: { userId: uid, date: { gte: since } },
      orderBy: { date: "asc" },
      select: { date: true, totalCAD: true, costBasisCAD: true, cashCAD: true },
    }),
    getFxRate(),
  ]);

  const series: V2GraphPoint[] = snapshots.map((s) => ({
    date: s.date.toISOString().slice(0, 10),
    totalCAD: toNum(s.totalCAD),
    costBasisCAD: toNum(s.costBasisCAD),
    cashCAD: toNum(s.cashCAD),
  }));

  return <V2GraphClient initialRange="3m" initialSeries={series} fxRate={fx.rate} />;
}

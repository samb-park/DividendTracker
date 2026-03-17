import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [settings, holdings] = await Promise.all([
    prisma.setting.findMany({ where: { key: { startsWith: "investment:" } } }),
    prisma.holding.findMany({
      where: { quantity: { gt: 0 } },
      select: { ticker: true },
      distinct: ["ticker"],
    }),
  ]);

  const contribution = settings.find(s => s.key === "investment:contribution")
    ? JSON.parse(settings.find(s => s.key === "investment:contribution")!.value)
    : null;

  const targets: Record<string, { pct: number }> = {};
  for (const s of settings) {
    if (s.key.startsWith("investment:target:")) {
      const ticker = s.key.slice("investment:target:".length);
      targets[ticker] = JSON.parse(s.value);
    }
  }

  return NextResponse.json({
    contribution,
    targets,
    tickers: holdings.map(h => h.ticker),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.type === "contribution") {
    const { frequency, amount, currency } = body;
    await prisma.setting.upsert({
      where: { key: "investment:contribution" },
      update: { value: JSON.stringify({ frequency, amount, currency }) },
      create: { key: "investment:contribution", value: JSON.stringify({ frequency, amount, currency }) },
    });
  } else if (body.type === "target") {
    const { ticker, pct } = body;
    const key = `investment:target:${ticker}`;
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify({ pct }) },
      create: { key, value: JSON.stringify({ pct }) },
    });
  }
  return NextResponse.json({ ok: true });
}

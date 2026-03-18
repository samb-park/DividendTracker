import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const incomeGoalSetting = settings.find(s => s.key === "investment:income_goal");
  const incomeGoal = incomeGoalSetting ? JSON.parse(incomeGoalSetting.value) : null;

  const contribRoomSetting = settings.find(s => s.key === "investment:contrib_room");
  const contribRoom = contribRoomSetting ? JSON.parse(contribRoomSetting.value) : null;

  const targets: Record<string, { pct: number }> = {};
  for (const s of settings) {
    if (s.key.startsWith("investment:target:")) {
      const ticker = s.key.slice("investment:target:".length);
      targets[ticker] = JSON.parse(s.value);
    }
  }

  return NextResponse.json({
    contribution,
    incomeGoal,
    contribRoom,
    targets,
    tickers: holdings.map(h => h.ticker),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  } else if (body.type === "income_goal") {
    const { annualTarget, currency } = body;
    await prisma.setting.upsert({
      where: { key: "investment:income_goal" },
      update: { value: JSON.stringify({ annualTarget, currency }) },
      create: { key: "investment:income_goal", value: JSON.stringify({ annualTarget, currency }) },
    });
  } else if (body.type === "contrib_room") {
    const { tfsaCarryover, rrspLimit, fhsaCarryover } = body;
    await prisma.setting.upsert({
      where: { key: "investment:contrib_room" },
      update: { value: JSON.stringify({ tfsaCarryover, rrspLimit, fhsaCarryover }) },
      create: { key: "investment:contrib_room", value: JSON.stringify({ tfsaCarryover, rrspLimit, fhsaCarryover }) },
    });
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

function userKey(userId: string, key: string) {
  return `${userId}:${key}`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const uid = session.user.id;
  const prefix = `${uid}:investment:`;

  const [settings, holdings] = await Promise.all([
    prisma.setting.findMany({ where: { key: { startsWith: prefix } } }),
    prisma.holding.findMany({
      where: { quantity: { gt: 0 }, portfolio: { userId: uid } },
      select: { ticker: true },
      distinct: ["ticker"],
    }),
  ]);

  const get = (k: string) => settings.find(s => s.key === userKey(uid, k));

  const contribution = get("investment:contribution")
    ? JSON.parse(get("investment:contribution")!.value)
    : null;

  const incomeGoalSetting = get("investment:income_goal");
  const incomeGoal = incomeGoalSetting ? JSON.parse(incomeGoalSetting.value) : null;

  const contribRoomSetting = get("investment:contrib_room");
  const contribRoom = contribRoomSetting ? JSON.parse(contribRoomSetting.value) : null;

  const targets: Record<string, { pct: number }> = {};
  for (const s of settings) {
    const targetPrefix = userKey(uid, "investment:target:");
    if (s.key.startsWith(targetPrefix)) {
      const ticker = s.key.slice(targetPrefix.length);
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

  const uid = session.user.id;
  const body = await req.json();

  if (body.type === "contribution") {
    const { frequency, amount, currency } = body;
    const key = userKey(uid, "investment:contribution");
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify({ frequency, amount, currency }) },
      create: { key, value: JSON.stringify({ frequency, amount, currency }) },
    });
  } else if (body.type === "target") {
    const { ticker, pct } = body;
    if (!ticker || !/^[A-Z0-9.^-]{1,15}$/i.test(ticker)) {
      return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
    }
    const key = userKey(uid, `investment:target:${ticker.toUpperCase()}`);
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify({ pct }) },
      create: { key, value: JSON.stringify({ pct }) },
    });
  } else if (body.type === "income_goal") {
    const { annualTarget, currency } = body;
    const key = userKey(uid, "investment:income_goal");
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify({ annualTarget, currency }) },
      create: { key, value: JSON.stringify({ annualTarget, currency }) },
    });
  } else if (body.type === "contrib_room") {
    const { tfsaCarryover, rrspLimit, fhsaCarryover } = body;
    const key = userKey(uid, "investment:contrib_room");
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify({ tfsaCarryover, rrspLimit, fhsaCarryover }) },
      create: { key, value: JSON.stringify({ tfsaCarryover, rrspLimit, fhsaCarryover }) },
    });
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { z } from "zod";

const contributionSchema = z.object({
  type: z.literal("contribution"),
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
  amount: z.number().finite().positive().max(1_000_000),
  currency: z.enum(["CAD", "USD"]),
});
const targetSchema = z.object({
  type: z.literal("target"),
  ticker: z.string().regex(/^[A-Z0-9.^-]{1,15}$/i),
  pct: z.number().finite().min(0).max(100),
});
const incomeGoalSchema = z.object({
  type: z.literal("income_goal"),
  annualTarget: z.number().finite().positive().max(10_000_000),
  currency: z.enum(["CAD", "USD"]),
});
const contribRoomSchema = z.object({
  type: z.literal("contrib_room"),
  tfsaCarryover: z.number().finite().min(0).max(500_000),
  rrspLimit: z.number().finite().min(0).max(500_000),
  fhsaCarryover: z.number().finite().min(0).max(100_000),
});
const investorProfileSchema = z.object({
  type: z.literal("investor_profile"),
  birthYear: z.number().int().min(1940).max(new Date().getFullYear() - 18),
  goals: z.array(z.enum(["retirement", "house", "education", "short_term", "passive_income", "wealth_building"])).min(1).max(6),
});
const settingsSchema = z.discriminatedUnion("type", [
  contributionSchema, targetSchema, incomeGoalSchema, contribRoomSchema, investorProfileSchema,
]);

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

  const investorProfileSetting = get("investment:investor_profile");
  const investorProfile = investorProfileSetting ? JSON.parse(investorProfileSetting.value) : null;

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
    investorProfile,
    targets,
    tickers: holdings.map(h => h.ticker),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const uid = session.user.id;
  const parsed = settingsSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

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
  } else if (body.type === "investor_profile") {
    const { birthYear, goals } = body;
    const key = userKey(uid, "investment:investor_profile");
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify({ birthYear, goals }) },
      create: { key, value: JSON.stringify({ birthYear, goals }) },
    });
  }
  return NextResponse.json({ ok: true });
}

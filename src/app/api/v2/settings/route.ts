import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { z } from "zod";
import { deleteUserAiCache } from "@/lib/ai-cache";

export const dynamic = "force-dynamic";

const TICKER_RE = /^[A-Z0-9.^-]{1,15}$/i;

const contributionSchema = z.object({
  type: z.literal("contribution"),
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
  amount: z.number().finite().min(0).max(1_000_000),
  currency: z.enum(["CAD", "USD"]),
  cashAvailableCAD: z.number().finite().min(0).max(99_999_999).optional(),
});

const nonCorePlanSchema = z.object({
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
  cad: z.number().finite().min(0).max(1_000_000),
}).strict();

const targetSchema = z.object({
  type: z.literal("target"),
  ticker: z.string().regex(TICKER_RE),
  pct: z.number().finite().min(0).max(100),
  excluded: z.boolean().optional(),
  nonCorePlan: nonCorePlanSchema.nullable().optional(),
});

const reserveSchema = z.object({
  type: z.literal("reserve"),
  ticker: z.string().regex(TICKER_RE),
  targetPct: z.number().finite().min(0).max(100),
  plannedWeeklyCAD: z.number().finite().min(0).max(1_000_000),
  active: z.boolean(),
});

const redistributionSchema = z.object({
  type: z.literal("redistribution_rule"),
  rule: z.enum(["shortfall_proportional", "even", "priority"]),
  priorityList: z.array(z.string().regex(TICKER_RE)).max(50).optional(),
});

const bodySchema = z.discriminatedUnion("type", [
  contributionSchema,
  targetSchema,
  reserveSchema,
  redistributionSchema,
]);

function userKey(uid: string, key: string) {
  return `${uid}:${key}`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const uid = session.user.id;

  const [settings, holdings] = await Promise.all([
    prisma.setting.findMany({ where: { key: { startsWith: `${uid}:investment:` } } }),
    prisma.holding.findMany({
      where: { isActive: true, quantity: { gt: 0 }, portfolio: { userId: uid } },
      select: { ticker: true },
      distinct: ["ticker"],
    }),
  ]);

  const get = (k: string) => settings.find((s) => s.key === userKey(uid, k));

  const contributionRaw = get("investment:contribution");
  const contribution = contributionRaw ? JSON.parse(contributionRaw.value) : null;

  const redistributionRaw = get("investment:redistribution_rule");
  const redistribution = redistributionRaw
    ? JSON.parse(redistributionRaw.value)
    : { rule: "shortfall_proportional" };

  const targets: Record<string, { pct: number; excluded?: boolean }> = {};
  const reserves: Record<string, { targetPct: number; plannedWeeklyCAD: number; active: boolean }> = {};

  const targetPrefix = userKey(uid, "investment:target:");
  const reservePrefix = userKey(uid, "investment:reserve:");

  for (const s of settings) {
    if (s.key.startsWith(targetPrefix)) {
      const ticker = s.key.slice(targetPrefix.length).toUpperCase();
      try {
        targets[ticker] = JSON.parse(s.value);
      } catch {
        // ignore malformed entries
      }
    } else if (s.key.startsWith(reservePrefix)) {
      const ticker = s.key.slice(reservePrefix.length).toUpperCase();
      try {
        reserves[ticker] = JSON.parse(s.value);
      } catch {
        // ignore
      }
    }
  }

  return NextResponse.json({
    contribution,
    targets,
    reserves,
    redistribution,
    tickers: holdings.map((h) => h.ticker.toUpperCase()),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const uid = session.user.id;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  if (body.type === "contribution") {
    const key = userKey(uid, "investment:contribution");
    const val: Record<string, unknown> = {
      frequency: body.frequency,
      amount: body.amount,
      currency: body.currency,
    };
    if (body.cashAvailableCAD !== undefined) val.cashAvailableCAD = body.cashAvailableCAD;
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(val) },
      create: { key, value: JSON.stringify(val) },
    });
  } else if (body.type === "target") {
    const key = userKey(uid, `investment:target:${body.ticker.toUpperCase()}`);
    const val: Record<string, unknown> = { pct: body.pct };
    if (body.excluded !== undefined) val.excluded = body.excluded;
    // nonCorePlan is meaningful only when excluded=true; null/undefined clears it.
    if (body.nonCorePlan !== undefined) {
      if (body.nonCorePlan === null) {
        // explicit clear — leave key out of JSON
      } else {
        val.nonCorePlan = body.nonCorePlan;
      }
    }
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(val) },
      create: { key, value: JSON.stringify(val) },
    });
  } else if (body.type === "reserve") {
    const key = userKey(uid, `investment:reserve:${body.ticker.toUpperCase()}`);
    const val = {
      targetPct: body.targetPct,
      plannedWeeklyCAD: body.plannedWeeklyCAD,
      active: body.active,
    };
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(val) },
      create: { key, value: JSON.stringify(val) },
    });
  } else if (body.type === "redistribution_rule") {
    const key = userKey(uid, "investment:redistribution_rule");
    const val: Record<string, unknown> = { rule: body.rule };
    if (body.rule === "priority" && body.priorityList) {
      val.priorityList = body.priorityList.map((t: string) => t.toUpperCase());
    }
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(val) },
      create: { key, value: JSON.stringify(val) },
    });
  }

  // Any successful settings change can affect the AI prompt context (Core %,
  // Non-Core CAD, contribution amount/frequency, redistribution rule). Invalidate
  // the user's AI cache so the next AI page load reflects the new settings.
  await deleteUserAiCache(uid).catch(() => { /* non-fatal */ });

  return NextResponse.json({ ok: true });
}

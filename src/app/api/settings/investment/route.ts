import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { z } from "zod";
import { buildGlidepathTargets } from "@/lib/glide-path";
import { deleteUserAiCache } from "@/lib/ai-cache";

const contributionSchema = z.object({
  type: z.literal("contribution"),
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
  amount: z.number().finite().positive().max(1_000_000),
  currency: z.enum(["CAD", "USD"]),
  cashAvailableCAD: z.number().finite().min(0).max(99_999_999).optional(),
});
const nonCorePlanSchema = z.object({
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
  cad: z.number().finite().min(0).max(1_000_000),
}).strict();
const targetSchema = z.object({
  type: z.literal("target"),
  ticker: z.string().regex(/^[A-Z0-9.^-]{1,15}$/i),
  pct: z.number().finite().min(0).max(100),
  excluded: z.boolean().optional(),
  nonCorePlan: nonCorePlanSchema.nullable().optional(),
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
  retirementAge: z.number().int().min(40).max(80).optional(),
  annualIncome: z.number().int().min(0).max(9_999_999).optional(),
  goals: z.array(z.enum(["retirement", "house", "education", "short_term", "passive_income", "wealth_building"])).min(1).max(6),
});
const accountMappingSchema = z.object({
  type: z.literal("account_mapping"),
  mapping: z.record(z.string().regex(/^[A-Z0-9.^-]{1,15}$/i), z.enum(["RRSP", "TFSA", "FHSA", "NON_REG"])),
});
const triggerParamsSchema = z.object({
  type: z.literal("trigger_params"),
  // upperTriggerPct removed: rulebook v4.1.8 fixes the QLD emergency cap at 38%
  // (core basis); user-configurable trigger threshold is no longer supported.
  glidepathAuto: z.boolean(),
});
const projectionAssumptionsSchema = z.object({
  type: z.literal("projection_assumptions"),
  divGrowthPct: z.number().finite().min(0).max(20).optional(),
  taxWithholdPct: z.number().finite().min(0).max(50).optional(),
}).strict();
const settingsSchema = z.discriminatedUnion("type", [
  contributionSchema, targetSchema, incomeGoalSchema, contribRoomSchema, investorProfileSchema,
  accountMappingSchema, triggerParamsSchema, projectionAssumptionsSchema,
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
      where: { isActive: true, quantity: { gt: 0 }, portfolio: { userId: uid } },
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

  const accountMappingSetting = get("investment:account_mapping");
  const accountMapping: Record<string, "RRSP" | "TFSA" | "FHSA" | "NON_REG"> = accountMappingSetting
    ? JSON.parse(accountMappingSetting.value)
    : {};

  const triggerParamsSetting = get("investment:trigger_params");
  // Stored shape may still contain a legacy upperTriggerPct from older clients;
  // we ignore it here (rulebook v4.1.8 fixes the cap at 38%).
  const triggerParams: { glidepathAuto: boolean } = triggerParamsSetting
    ? (() => {
        try {
          const parsed = JSON.parse(triggerParamsSetting.value) as { glidepathAuto?: boolean };
          return { glidepathAuto: parsed.glidepathAuto ?? true };
        } catch {
          return { glidepathAuto: true };
        }
      })()
    : { glidepathAuto: true };

  const targets: Record<string, { pct: number; excluded?: boolean; nonCorePlan?: { frequency: "weekly" | "biweekly" | "monthly"; cad: number } }> = {};
  for (const s of settings) {
    const targetPrefix = userKey(uid, "investment:target:");
    if (s.key.startsWith(targetPrefix)) {
      const ticker = s.key.slice(targetPrefix.length);
      targets[ticker] = JSON.parse(s.value);
    }
  }

  const projectionAssumptionsSetting = get("investment:projection_assumptions");
  let projectionAssumptions: { divGrowthPct?: number; taxWithholdPct?: number } | null = null;
  if (projectionAssumptionsSetting?.value) {
    try { projectionAssumptions = JSON.parse(projectionAssumptionsSetting.value); } catch { /* ignore */ }
  }

  return NextResponse.json({
    contribution,
    incomeGoal,
    contribRoom,
    investorProfile,
    targets,
    tickers: holdings.map(h => h.ticker),
    accountMapping,
    triggerParams,
    projectionAssumptions,
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
    const { frequency, amount, currency, cashAvailableCAD } = body;
    const key = userKey(uid, "investment:contribution");
    const val: Record<string, unknown> = { frequency, amount, currency };
    if (cashAvailableCAD !== undefined) val.cashAvailableCAD = cashAvailableCAD;
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(val) },
      create: { key, value: JSON.stringify(val) },
    });
  } else if (body.type === "target") {
    const { ticker, pct, excluded, nonCorePlan } = body;
    const key = userKey(uid, `investment:target:${ticker.toUpperCase()}`);
    const val: Record<string, unknown> = { pct };
    if (excluded !== undefined) val.excluded = excluded;
    if (nonCorePlan !== undefined && nonCorePlan !== null) val.nonCorePlan = nonCorePlan;
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(val) },
      create: { key, value: JSON.stringify(val) },
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
    const { birthYear, retirementAge, annualIncome, goals } = body;
    const key = userKey(uid, "investment:investor_profile");
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify({ birthYear, retirementAge, annualIncome, goals }) },
      create: { key, value: JSON.stringify({ birthYear, retirementAge, annualIncome, goals }) },
    });

    // Auto-update glide path targets when enabled
    const triggerKey = userKey(uid, "investment:trigger_params");
    const triggerSetting = await prisma.setting.findUnique({ where: { key: triggerKey } });
    let glidepathAuto = true;
    if (triggerSetting) {
      try {
        const parsed = JSON.parse(triggerSetting.value) as { glidepathAuto?: boolean };
        glidepathAuto = parsed.glidepathAuto ?? true;
      } catch { /* fall back to default true */ }
    }

    if (glidepathAuto === true) {
      const age = new Date().getFullYear() - birthYear;
      const glideTargets = buildGlidepathTargets(age);
      await Promise.all(
        Object.entries(glideTargets).map(([ticker, pct]) => {
          const targetKey = userKey(uid, `investment:target:${ticker}`);
          const value = JSON.stringify({ pct });
          return prisma.setting.upsert({
            where: { key: targetKey },
            update: { value },
            create: { key: targetKey, value },
          });
        })
      );
    }
  } else if (body.type === "account_mapping") {
    const { mapping } = body;
    const key = userKey(uid, "investment:account_mapping");
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(mapping) },
      create: { key, value: JSON.stringify(mapping) },
    });
  } else if (body.type === "trigger_params") {
    const { glidepathAuto } = body;
    const key = userKey(uid, "investment:trigger_params");
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify({ glidepathAuto }) },
      create: { key, value: JSON.stringify({ glidepathAuto }) },
    });
  } else if (body.type === "projection_assumptions") {
    const val: Record<string, number> = {};
    if (body.divGrowthPct !== undefined) val.divGrowthPct = body.divGrowthPct;
    if (body.taxWithholdPct !== undefined) val.taxWithholdPct = body.taxWithholdPct;
    const key = userKey(uid, "investment:projection_assumptions");
    await prisma.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(val) },
      create: { key, value: JSON.stringify(val) },
    });
  }
  // Any successful save can affect the AI prompt context. Drop AI cache so
  // the next AI page load reflects the new settings without a manual refresh.
  await deleteUserAiCache(uid).catch(() => { /* non-fatal */ });
  return NextResponse.json({ ok: true });
}

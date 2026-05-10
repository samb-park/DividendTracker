import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getPrice, getFxRate } from "@/lib/price";
import {
  callOpenAI,
  getCachedAiResult,
  saveAiResult,
} from "@/lib/openai";
import {
  computeRulebookWeights,
  computeMethodBAllocation,
  computeIaumWeeklyPlan,
  computeTqqqSoftExitPlan,
  computeTqqqHardExitPlan,
  computeCrisisTriggerPlan,
  computeAnnualRebalancePlan,
  projectScenariosRulebook,
  RULEBOOK_SCENARIOS,
  RULEBOOK_TARGETS,
} from "@/lib/rulebook";
import { AI_OUTPUT_RULES, PROJECTION_STRUCTURE, RULEBOOK_GUARDRAILS, RULEBOOK_PROMPT_VERSION, sanitizeAiOutput } from "@/lib/ai-output-rules";
import { checkAiThrottle } from "@/lib/ai-throttle";

export const dynamic = "force-dynamic";

const DEFAULT_FX = 1.38;
const CACHE_KEY = `ai_projection_${RULEBOOK_PROMPT_VERSION}`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force) {
    const cachedStr = await getCachedAiResult(userId, CACHE_KEY);
    if (cachedStr) {
      try {
        const parsed = JSON.parse(cachedStr) as { currentState?: unknown };
        // Old cache lacking currentState (pre-snapshot UI) → force recompute instead of returning broken shape.
        if (parsed.currentState) {
          return NextResponse.json({ ...parsed, cached: true });
        }
      } catch { /* fall through to recompute */ }
    }
  }

  const throttle = checkAiThrottle(userId);
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: `AI 요청이 너무 많습니다. ${throttle.retryAfterSec}초 후 다시 시도하세요.` },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSec) } },
    );
  }

  // Defensive: surface server-side exceptions as a structured error so the UI can show a real message
  // instead of the generic "룰북 상태를 가져올 수 없습니다." fallback.
  try {
    return await runProjection(userId);
  } catch (err) {
    console.error("[ai/projection] failed:", err);
    const message = err instanceof Error ? err.message : "projection failed";
    return NextResponse.json(
      { error: `룰북 계산 실패: ${message}` },
      { status: 500 },
    );
  }
}

async function runProjection(userId: string) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);

  const [snapshots, dividendsThisYear, dividendsPrevYear, holdingsRaw, contribPlanSetting, investorProfileSetting, fxSetting, incomGoalSetting, contribRoomSetting, cashTxThisYear, fxLive, targetSettings, projAssumptionsSetting] =
    await Promise.all([
      prisma.portfolioSnapshot.findMany({ where: { userId }, orderBy: { date: "asc" } }),
      prisma.transaction.findMany({
        where: {
          action: "DIVIDEND",
          date: { gte: oneYearAgo },
          holding: { portfolio: { userId } },
        },
        include: { holding: { select: { currency: true } } },
      }),
      prisma.transaction.findMany({
        where: {
          action: "DIVIDEND",
          date: { gte: twoYearsAgo, lt: oneYearAgo },
          holding: { portfolio: { userId } },
        },
        include: { holding: { select: { currency: true } } },
      }),
      prisma.holding.findMany({
        where: { quantity: { gt: 0 }, portfolio: { userId } },
        select: { ticker: true, currency: true, quantity: true },
      }),
      prisma.setting.findUnique({ where: { key: `${userId}:investment:contribution` } }),
      prisma.setting.findUnique({ where: { key: `${userId}:investment:investor_profile` } }),
      prisma.setting.findUnique({ where: { key: "fx_rate_usd_cad" } }),
      prisma.setting.findUnique({ where: { key: `${userId}:investment:income_goal` } }),
      prisma.setting.findUnique({ where: { key: `${userId}:investment:contrib_room` } }),
      prisma.cashTransaction.findMany({
        where: {
          portfolio: { userId },
          action: "DEPOSIT",
          date: { gte: new Date(`${currentYear}-01-01`) },
        },
        include: { portfolio: { select: { name: true } } },
      }),
      getFxRate().catch(() => null),
      prisma.setting.findMany({ where: { key: { startsWith: `${userId}:investment:target:` } } }),
      prisma.setting.findUnique({ where: { key: `${userId}:investment:projection_assumptions` } }),
    ]);

  const fxFromSetting = fxSetting ? (parseFloat(fxSetting.value) || DEFAULT_FX) : DEFAULT_FX;
  const fxRate = fxLive && !fxLive.fallback ? fxLive.rate : fxFromSetting;

  // ── Aggregate live holdings by ticker, price in CAD ──
  const tickerAgg = new Map<string, { ticker: string; currency: "CAD" | "USD"; shares: number }>();
  for (const h of holdingsRaw) {
    const t = h.ticker.toUpperCase();
    const shares = parseFloat(h.quantity?.toString() ?? "0");
    const prev = tickerAgg.get(t);
    if (prev) prev.shares += shares;
    else tickerAgg.set(t, { ticker: t, currency: h.currency as "CAD" | "USD", shares });
  }
  const tickerList = Array.from(tickerAgg.keys());
  const priceResults = await Promise.all(tickerList.map(async (t) => {
    try { const p = await getPrice(t); return [t, p?.price ?? null] as const; }
    catch { return [t, null] as const; }
  }));
  const priceMap = new Map<string, number | null>(priceResults);

  const holdingsCAD = tickerList.map(t => {
    const a = tickerAgg.get(t)!;
    const px = priceMap.get(t);
    const fx = a.currency === "USD" ? fxRate : 1;
    return { ticker: t, valueCAD: px != null ? a.shares * px * fx : 0 };
  });

  const liveTotalCAD = holdingsCAD.reduce((s, h) => s + h.valueCAD, 0);
  // Snapshot is source of truth for snapshots-driven projection but live ticker prices give the
  // accurate current weights. Prefer live total when it is non-zero; fall back to snapshot.
  const latestSnap = snapshots.at(-1);
  const snapshotValueCAD = latestSnap ? parseFloat(latestSnap.totalCAD.toString()) : 0;
  const currentValueCAD = liveTotalCAD > 0 ? liveTotalCAD : snapshotValueCAD;

  // RULEBOOK weights
  const weights = computeRulebookWeights(holdingsCAD);

  // Annual dividends (last 12 months, converted to CAD)
  const sumDivCAD = (txs: typeof dividendsThisYear) =>
    txs.reduce((sum, tx) => {
      const amt = parseFloat(tx.price.toString()) * parseFloat(tx.quantity.toString());
      return sum + (tx.holding.currency === "USD" ? amt * fxRate : amt);
    }, 0);

  const annualDivCAD = sumDivCAD(dividendsThisYear);
  const prevAnnualDivCAD = sumDivCAD(dividendsPrevYear);

  // User-overridable projection assumptions (Settings → projection_assumptions).
  let projAssumptions: { divGrowthPct?: number; taxWithholdPct?: number } | null = null;
  if (projAssumptionsSetting?.value) {
    try { projAssumptions = JSON.parse(projAssumptionsSetting.value); } catch { /* ignore */ }
  }

  let divGrowthPct = 5;
  if (prevAnnualDivCAD > 0 && annualDivCAD > 0) {
    divGrowthPct = Math.max(0, Math.min(20, ((annualDivCAD / prevAnnualDivCAD) - 1) * 100));
  }
  // User override takes precedence over auto-derived value.
  if (typeof projAssumptions?.divGrowthPct === "number") {
    divGrowthPct = Math.max(0, Math.min(20, projAssumptions.divGrowthPct));
  }
  const taxWithholdPct = Math.max(0, Math.min(50, projAssumptions?.taxWithholdPct ?? 0));
  const divYieldPct = currentValueCAD > 0 ? (annualDivCAD / currentValueCAD) * 100 : 0;

  // Annual + weekly contribution in CAD
  let annualContribCAD = 0;
  let weeklyContribCAD = 0;
  let contribFrequency: "weekly" | "biweekly" | "monthly" = "monthly";
  let contribPlan: { amount?: number; currency?: string; frequency?: string } | null = null;
  if (contribPlanSetting?.value) {
    try { contribPlan = JSON.parse(contribPlanSetting.value); } catch { /* ignore malformed setting */ }
  }
  if (contribPlan) {
    const amtCAD = (contribPlan.amount ?? 0) * (contribPlan.currency === "USD" ? fxRate : 1);
    const mult = contribPlan.frequency === "weekly" ? 52 : contribPlan.frequency === "biweekly" ? 26 : 12;
    annualContribCAD = amtCAD * mult;
    weeklyContribCAD = annualContribCAD / 52;
    contribFrequency = (contribPlan.frequency ?? "monthly") as "weekly" | "biweekly" | "monthly";
  }

  // ── Weekly contribution split — Core → SGOV → IAUM (사용자 확정 순서) ──
  const TFSA_ANNUAL_2026 = 7000;
  let tfsaCarryover = 0;
  if (contribRoomSetting?.value) {
    try {
      const parsed = JSON.parse(contribRoomSetting.value) as { tfsaCarryover?: string | number };
      tfsaCarryover = parseFloat(String(parsed.tfsaCarryover ?? "0")) || 0;
    } catch { /* ignore */ }
  }
  const tfsaDepositedThisYear = cashTxThisYear
    .filter(tx => (tx.portfolio.name ?? "").toUpperCase().includes("TFSA"))
    .reduce((sum, tx) => sum + parseFloat(tx.amount.toString()), 0);
  const tfsaRoomTotal = tfsaCarryover + TFSA_ANNUAL_2026;
  const tfsaRoomRemaining = Math.max(0, tfsaRoomTotal - tfsaDepositedThisYear);
  const tfsaRoomExists = tfsaRoomRemaining > 0;

  // Read user Non-Core CAD overrides from target settings.
  const nonCoreCADByTicker: Record<string, number> = {};
  const targetPrefix = `${userId}:investment:target:`;
  for (const s of targetSettings) {
    const ticker = s.key.slice(targetPrefix.length).toUpperCase();
    try {
      const parsed = JSON.parse(s.value) as { excluded?: boolean; nonCorePlan?: { cad?: number } };
      const cad = parsed.nonCorePlan?.cad;
      if (typeof cad === "number" && cad > 0 && !parsed.excluded) {
        nonCoreCADByTicker[ticker] = cad;
      }
    } catch { /* ignore */ }
  }
  const sgovUserCAD = nonCoreCADByTicker["SGOV"];
  const iaumUserCAD = nonCoreCADByTicker["IAUM"];
  const sgovTargetCAD = sgovUserCAD && sgovUserCAD > 0 ? sgovUserCAD : RULEBOOK_TARGETS.SGOV_WEEKLY_REFILL_CAD;
  const iaumTargetCAD = iaumUserCAD && iaumUserCAD > 0 ? iaumUserCAD : RULEBOOK_TARGETS.IAUM_WEEKLY_BUY_CAD;
  const sgovSourceLabel = sgovUserCAD && sgovUserCAD > 0 ? "user-settings" : "rulebook-default";
  const iaumSourceLabel = iaumUserCAD && iaumUserCAD > 0 ? "user-settings" : "rulebook-default";

  // Core: full weekly contribution → Method B (SCHD/QLD shortfall). No carve-out.
  const methodB = computeMethodBAllocation(weights.schdCAD, weights.qldCAD, weeklyContribCAD);
  const coreContribCAD = methodB.schdBuyCAD + methodB.qldBuyCAD;
  const finalUnallocatedCAD = methodB.unallocatedCAD;

  // Non-Core: SEPARATE/ADDITIVE streams. User Settings CAD applies unconditionally; otherwise rulebook
  // default with §3/§8 conditions.
  // v4.1.10: skip contribution-funded SGOV refill when Hard Exit is firing — its proceeds already
  // refill SGOV to 8% of total, so adding weekly CAD on top would double-fund. Soft Exit is allowed
  // to coexist (its refill may not reach 8%), matching the legacy "only skip during emergency" intent.
  const sgovUserSet = !!(sgovUserCAD && sgovUserCAD > 0);
  const sgovActiveByRulebook = !weights.hardExit && weights.sgovBelowTarget;
  const sgovReserveCAD = sgovUserSet
    ? sgovUserCAD!
    : (sgovActiveByRulebook ? RULEBOOK_TARGETS.SGOV_WEEKLY_REFILL_CAD : 0);

  const iaumUserSet = !!(iaumUserCAD && iaumUserCAD > 0);
  const iaumPlan = computeIaumWeeklyPlan(tfsaRoomExists, weights.iaumTotalWeightPct);
  const iaumRuleAllowed = iaumPlan.iaumBuyCAD > 0;
  const iaumActualCAD = iaumUserSet
    ? iaumUserCAD!
    : (iaumRuleAllowed ? RULEBOOK_TARGETS.IAUM_WEEKLY_BUY_CAD : 0);
  const iaumDeferred = false;

  const iaumApplyReason = iaumUserSet
    ? `사용자 Settings 별도 스트림: $${Math.round(iaumActualCAD)} CAD/period (source=${iaumSourceLabel})`
    : iaumActualCAD > 0
      ? `룰북 default: $${Math.round(iaumActualCAD)} CAD (TFSA room + IAUM<5%)`
      : iaumPlan.reason;

  const totalWeeklyOutCAD = weeklyContribCAD + sgovReserveCAD + iaumActualCAD;

  // v4.1.10 event-driven plans — surfaced only when triggered.
  //  §6.2 TQQQ Soft / Hard Exit ladder
  //  §6.1 Crisis Trigger (SGOV → TQQQ)
  //  §5   Annual Rebalance (Case A / B / deadband)
  const softExitPlan = computeTqqqSoftExitPlan({
    schdCAD:  weights.schdCAD,
    qldCAD:   weights.qldCAD,
    tqqqCAD:  weights.tqqqCAD,
    sgovCAD:  weights.sgovCAD,
    totalCAD: currentValueCAD,
    softExit: weights.softExit,
  });
  const hardExitPlan = computeTqqqHardExitPlan({
    schdCAD:  weights.schdCAD,
    qldCAD:   weights.qldCAD,
    tqqqCAD:  weights.tqqqCAD,
    sgovCAD:  weights.sgovCAD,
    totalCAD: currentValueCAD,
    hardExit: weights.hardExit,
  });
  const crisisPlan = computeCrisisTriggerPlan({
    totalCAD:   currentValueCAD,
    sgovCAD:    weights.sgovCAD,
    crisisT1:   weights.crisisT1,
    crisisT2:   weights.crisisT2,
    cycleArmed: weights.tqqqCAD <= 0,
    tqqqCAD:    weights.tqqqCAD,
  });
  const rebalPlan = computeAnnualRebalancePlan({
    schdCAD:       weights.schdCAD,
    qldCAD:        weights.qldCAD,
    tqqqCAD:       weights.tqqqCAD,
    sgovCAD:       weights.sgovCAD,
    totalCAD:      currentValueCAD,
    caseAEligible: weights.caseAEligible,
    caseBEligible: weights.caseBEligible,
  });

  let profile: { birthYear?: number; retirementAge?: number } | null = null;
  if (investorProfileSetting?.value) {
    try { profile = JSON.parse(investorProfileSetting.value); } catch { /* ignore malformed setting */ }
  }
  const birthYear: number | null = profile?.birthYear ?? null;
  const retirementAge: number | null = profile?.retirementAge ?? null;
  const retirementYear = birthYear && retirementAge ? birthYear + retirementAge : null;
  const yearsToRetirement = retirementYear ? Math.max(0, retirementYear - currentYear) : null;

  let incomeGoal: { annualTarget?: number; currency?: string } | null = null;
  if (incomGoalSetting?.value) {
    try { incomeGoal = JSON.parse(incomGoalSetting.value); } catch { /* ignore malformed setting */ }
  }
  const incomeGoalCAD = incomeGoal
    ? ((incomeGoal.annualTarget ?? 0) * (incomeGoal.currency === "USD" ? fxRate : 1))
    : null;

  const maxYears = Math.max(20, yearsToRetirement ? yearsToRetirement + 5 : 20);
  const yearPoints = Array.from(
    new Set([1, 2, 3, 5, 10, 15, 20, yearsToRetirement].filter((y): y is number => y !== null && y > 0 && y <= maxYears)),
  ).sort((a, b) => a - b);

  // Per-asset yields. SCHD/QLD/SGOV use rough ETF averages; IAUM is 0 (gold).
  // Document as model assumption — actual yields depend on holdings/distributions.
  const SCHD_TYPICAL_YIELD_PCT = 3.5;
  const QLD_TYPICAL_YIELD_PCT  = 0.5;
  const SGOV_TYPICAL_YIELD_PCT = 4.5;

  const scenarios = projectScenariosRulebook({
    start: {
      schdCAD: weights.schdCAD,
      qldCAD:  weights.qldCAD,
      sgovCAD: weights.sgovCAD,
      iaumCAD: weights.iaumCAD,
      tqqqCAD: weights.tqqqCAD,
      schdYieldPct: SCHD_TYPICAL_YIELD_PCT,
      qldYieldPct:  QLD_TYPICAL_YIELD_PCT,
      sgovYieldPct: SGOV_TYPICAL_YIELD_PCT,
    },
    coreWeeklyCAD: weeklyContribCAD,
    sgovWeeklyCAD: nonCoreCADByTicker["SGOV"] ?? 0,
    iaumWeeklyCAD: nonCoreCADByTicker["IAUM"] ?? 0,
    tfsaRoomExists,
    redirectGatedToCore: true,
    qldDivGrowthFactor: 0.5,
    dcaContributionFactor: 0.5,
    taxWithholdPct,
    currentAge: birthYear ? currentYear - birthYear : null,
    divGrowthPct,
    yearPoints,
    maxYears,
  });

  const baseScenario = scenarios.find(s => s.id === "base")!;
  // projections (legacy field): map per-asset shape to the older 4-field point shape so
  // existing UI consumers (mobile / desktop projection table) keep working.
  const projections = baseScenario.points.map(p => ({
    year: p.year,
    yearsFromNow: p.yearsFromNow,
    portfolioCAD: p.totalCAD,
    annualDivCAD: p.annualDivCAD,
    monthlyDivCAD: p.monthlyDivCAD,
    totalContribCAD: p.totalContribCAD,
  }));

  // Structured snapshot for the UI — frontend uses this directly to render tables.
  const currentState = {
    portfolioValueCAD:   Math.round(currentValueCAD),
    coreCAD:             Math.round(weights.coreCAD),
    schdCAD:             Math.round(weights.schdCAD),
    qldCAD:              Math.round(weights.qldCAD),
    sgovCAD:             Math.round(weights.sgovCAD),
    iaumCAD:             Math.round(weights.iaumCAD),
    tqqqCAD:             Math.round(weights.tqqqCAD),
    qldCoreWeightPct:    Math.round(weights.qldCoreWeightPct  * 10) / 10,
    schdCoreWeightPct:   Math.round(weights.schdCoreWeightPct * 10) / 10,
    growthBucketPct:     Math.round(weights.growthBucketPct   * 10) / 10,
    sgovTotalWeightPct:  Math.round(weights.sgovTotalWeightPct * 10) / 10,
    iaumTotalWeightPct:  Math.round(weights.iaumTotalWeightPct * 10) / 10,
    tqqqTotalWeightPct:  Math.round(weights.tqqqTotalWeightPct * 10) / 10,
    flags: {
      hardExit:        weights.hardExit,
      softExit:        weights.softExit,
      crisisT1:        weights.crisisT1,
      crisisT2:        weights.crisisT2,
      caseAEligible:   weights.caseAEligible,
      caseBEligible:   weights.caseBEligible,
      inDeadband:      weights.inDeadband,
      cycleArmable:    weights.cycleArmable,
      sgovBelowTarget: weights.sgovBelowTarget,
      sgovBelowFloor:  weights.sgovBelowFloor,
      iaumAtCap:       weights.iaumAtCap,
    },
  };

  const methodBPlan = {
    weeklyContribCAD:  Math.round(weeklyContribCAD),  // Plan amount → 100% goes to Core Method B
    coreContribCAD:    Math.round(coreContribCAD),
    schdBuyCAD:        Math.round(methodB.schdBuyCAD),
    qldBuyCAD:         Math.round(methodB.qldBuyCAD),
    unallocatedCAD:    Math.round(finalUnallocatedCAD),
    // Non-Core: SEPARATE/ADDITIVE streams (not subtracted from weeklyContribCAD).
    sgovReserveCAD:    Math.round(sgovReserveCAD),
    iaumBuyCAD:        Math.round(iaumActualCAD),
    sgovSource:        sgovSourceLabel,
    iaumSource:        iaumSourceLabel,
    totalWeeklyOutCAD: Math.round(totalWeeklyOutCAD),
  };

  const iaumWeeklyPlan = {
    iaumRuleBuyCAD:       iaumPlan.iaumBuyCAD,        // 룰이 요구하는 금액 (25 또는 0)
    iaumActualBuyCAD:     Math.round(iaumActualCAD),  // 이번 주 실제 매수 (Core·SGOV 후 잔액)
    redirectedToCoreCAD:  iaumPlan.redirectedToCoreCAD,
    reason:               iaumApplyReason,
    tfsaRoomExists:       iaumPlan.tfsaRoomExists,
    iaumBelowCap:         iaumPlan.iaumBelowCap,
    account:              "TFSA",
    capCAD:               RULEBOOK_TARGETS.IAUM_WEEKLY_BUY_CAD,
  };

  // v4.1.10 §6.2 — Hard takes precedence over Soft. Proceeds order is fixed: SGOV → 8% of total → SCHD.
  const tqqqExitPlan = hardExitPlan.active
    ? {
        active:              true as const,
        variant:             "hard" as const,
        tqqqSaleCAD:         Math.round(hardExitPlan.tqqqSaleCAD),
        qldSaleCAD:          Math.round(hardExitPlan.qldSaleCAD),
        sgovRefillCAD:       Math.round(hardExitPlan.sgovRefillCAD),
        schdBuyCAD:          Math.round(hardExitPlan.schdBuyCAD),
        postGrowthBucketPct: Math.round(hardExitPlan.postGrowthBucketPct * 10) / 10,
        proceedsOrder:       "1) SGOV → 8% of total, 2) remainder → SCHD",
      }
    : softExitPlan.active
      ? {
          active:              true as const,
          variant:             "soft" as const,
          tqqqSaleCAD:         Math.round(softExitPlan.tqqqSaleCAD),
          qldSaleCAD:          Math.round(softExitPlan.qldSaleCAD),
          sgovRefillCAD:       Math.round(softExitPlan.sgovRefillCAD),
          schdBuyCAD:          Math.round(softExitPlan.schdBuyCAD),
          postGrowthBucketPct: Math.round(softExitPlan.postGrowthBucketPct * 10) / 10,
          proceedsOrder:       "1) SGOV → 8% of total, 2) remainder → SCHD",
        }
      : { active: false as const };

  const crisisTriggerPlan = crisisPlan.active
    ? {
        active:                 true as const,
        tier:                   crisisPlan.tier!,
        sgovSaleCAD:            Math.round(crisisPlan.sgovSaleCAD),
        tqqqBuyCAD:             Math.round(crisisPlan.tqqqBuyCAD),
        postSgovTotalWeightPct: Math.round(crisisPlan.postSgovTotalWeightPct * 10) / 10,
        reason:                 crisisPlan.reason,
      }
    : { active: false as const };

  const annualRebalancePlan = {
    action:               rebalPlan.action,
    qldSaleCAD:           Math.round(rebalPlan.qldSaleCAD),
    qldBuyCAD:            Math.round(rebalPlan.qldBuyCAD),
    sgovDeltaCAD:         Math.round(rebalPlan.sgovDeltaCAD),
    schdBuyCAD:           Math.round(rebalPlan.schdBuyCAD),
    postQldCoreWeightPct: Math.round(rebalPlan.postQldCoreWeightPct * 10) / 10,
  };

  const assumptions = {
    scenarioCagrsPct: RULEBOOK_SCENARIOS.map(s => ({ id: s.id, label: s.label, cagrPct: s.cagrPct })),
    portfolioCagrPct: baseScenario.cagrPct,
    divYieldPct: Math.round(divYieldPct * 100) / 100,
    divGrowthPct: Math.round(divGrowthPct * 10) / 10,
    annualContribCAD: Math.round(annualContribCAD),
    contribFrequency,
    currentValueCAD: Math.round(currentValueCAD),
    currentAnnualDivCAD: Math.round(annualDivCAD),
    retirementYear,
    rulebookVersion: "v4.1.10",
  };

  // ── AI narrative ──
  // Provide structured numbers in the prompt and require Korean labels in output.
  const goalLine = incomeGoalCAD ? `\n목표 연배당: $${Math.round(incomeGoalCAD).toLocaleString()} CAD` : "";
  const retireLine = retirementYear ? `\n은퇴 목표: ${retirementYear}년 (${yearsToRetirement}년 후)` : "";

  const triggerLines: string[] = [];
  if (weights.hardExit && hardExitPlan.active) {
    triggerLines.push(
      `- §6.2 Hard Exit (성장 버킷 ≥ ${RULEBOOK_TARGETS.HARD_EXIT_GROWTH_BUCKET_PCT}%): 현재 ${currentState.growthBucketPct}% (total 기준). ` +
      `다음 거래일 TQQQ 전량 매도 $${Math.round(hardExitPlan.tqqqSaleCAD).toLocaleString()} CAD + QLD 매도 $${Math.round(hardExitPlan.qldSaleCAD).toLocaleString()} CAD (코어 30%까지) → ` +
      `proceeds 순서: (1) SGOV 보충 $${Math.round(hardExitPlan.sgovRefillCAD).toLocaleString()} CAD (전체 ${RULEBOOK_TARGETS.SGOV_TARGET_PCT}%까지) → ` +
      `(2) 잔액 SCHD 매수 $${Math.round(hardExitPlan.schdBuyCAD).toLocaleString()} CAD. SCHD 매도 금지.`
    );
  } else if (weights.softExit && softExitPlan.active) {
    triggerLines.push(
      `- §6.2 Soft Exit (성장 버킷 ≥ ${RULEBOOK_TARGETS.SOFT_EXIT_GROWTH_BUCKET_PCT}%): 현재 ${currentState.growthBucketPct}% (total 기준). ` +
      `다음 거래일 TQQQ 절반 매도 $${Math.round(softExitPlan.tqqqSaleCAD).toLocaleString()} CAD → ` +
      `proceeds 순서: (1) SGOV 보충 $${Math.round(softExitPlan.sgovRefillCAD).toLocaleString()} CAD (전체 ${RULEBOOK_TARGETS.SGOV_TARGET_PCT}%까지) → ` +
      `(2) 잔액 SCHD 매수 $${Math.round(softExitPlan.schdBuyCAD).toLocaleString()} CAD. SCHD 매도 금지.`
    );
  }
  if (weights.crisisT1 && !weights.crisisT2)
    triggerLines.push(`- §6.1 Crisis T1 (코어 W ≤ ${RULEBOOK_TARGETS.CRISIS_T1_PCT}%): 현재 ${currentState.qldCoreWeightPct}% (코어 기준) — SGOV 매도 → TQQQ 매수 (총자산의 ${RULEBOOK_TARGETS.CRISIS_T1_BUY_PCT_OF_TOTAL}%). 사이클 재무장 시에만 발동.`);
  if (weights.crisisT2)
    triggerLines.push(`- §6.1 Crisis T2 (코어 W ≤ ${RULEBOOK_TARGETS.CRISIS_T2_PCT}%): 현재 ${currentState.qldCoreWeightPct}% (코어 기준) — SGOV 추가 매도 → TQQQ 매수 (T1+T2 누적 총자산의 ${RULEBOOK_TARGETS.CRISIS_T1_BUY_PCT_OF_TOTAL + RULEBOOK_TARGETS.CRISIS_T2_BUY_PCT_OF_TOTAL}%). 같은 거래일 동시 실행 가능.`);
  if (weights.caseAEligible)
    triggerLines.push(`- §5 Case A (W > ${RULEBOOK_TARGETS.REBAL_HIGH_PCT}%): 현재 ${currentState.qldCoreWeightPct}% (코어 기준) — 연말(Dec 31) QLD 매도 → SGOV ${RULEBOOK_TARGETS.SGOV_TARGET_PCT}% → SCHD. SCHD 매도 금지.`);
  if (weights.caseBEligible)
    triggerLines.push(`- §5 Case B (W < ${RULEBOOK_TARGETS.REBAL_LOW_PCT}% AND TQQQ=0): 현재 ${currentState.qldCoreWeightPct}% (코어 기준) — 연말(Dec 31) SGOV 매도 → QLD 매수 (SGOV ${RULEBOOK_TARGETS.SGOV_FLOOR_PCT}% 바닥 보호).`);
  if (weights.inDeadband)
    triggerLines.push(`- §5 데드밴드 (${RULEBOOK_TARGETS.REBAL_LOW_PCT} ≤ W ≤ ${RULEBOOK_TARGETS.REBAL_HIGH_PCT}): 현재 ${currentState.qldCoreWeightPct}% (코어 기준) — 연말 리밸런스 무행동.`);
  if (weights.sgovBelowTarget && !weights.hardExit)
    triggerLines.push(`- §8 SGOV 보충 필요 (목표 ${RULEBOOK_TARGETS.SGOV_TARGET_PCT}%): 현재 ${currentState.sgovTotalWeightPct}% (total 기준) — 주간 ${RULEBOOK_TARGETS.SGOV_WEEKLY_REFILL_CAD} CAD 한도로 보충.`);
  if (weights.sgovBelowFloor)
    triggerLines.push(`- §8 SGOV 위기 바닥 침범 (${RULEBOOK_TARGETS.SGOV_FLOOR_PCT}% 미만): 현재 ${currentState.sgovTotalWeightPct}% (total 기준) — §6.1 위기 트리거 외 침범 금지.`);
  if (weights.iaumAtCap)
    triggerLines.push(`- §3 IAUM 상한 도달: 전체 비중 ${currentState.iaumTotalWeightPct}% ≥ ${RULEBOOK_TARGETS.IAUM_MAX_PCT}% (total 기준) — 추가 매수 금지, 주간 25 CAD는 Method B로 redirect.`);
  if (iaumActualCAD > 0)
    triggerLines.push(`- §3 IAUM 주간 매수 적용: $${Math.round(iaumActualCAD)} CAD (TFSA 계좌). 사유: ${iaumApplyReason}.`);
  else if (iaumDeferred)
    triggerLines.push(`- §3 IAUM 매수 보류: ${iaumApplyReason}.`);
  const triggerSummary = triggerLines.length ? triggerLines.join("\n") : "특이 신호 없음 (정상 운용)";

  const narrativeUserPrompt = [
    `[현재 포트폴리오]`,
    `총 평가금액: $${Math.round(currentValueCAD).toLocaleString()} CAD`,
    `코어 평가금액: $${currentState.coreCAD.toLocaleString()} CAD (SCHD $${currentState.schdCAD.toLocaleString()} + QLD $${currentState.qldCAD.toLocaleString()})`,
    `QLD 코어 비중 = QLD / (SCHD + QLD) = ${currentState.qldCAD.toLocaleString()} / ${currentState.coreCAD.toLocaleString()} = ${currentState.qldCoreWeightPct}%`,
    `SCHD 코어 비중 = ${currentState.schdCoreWeightPct}%`,
    `성장 버킷 비중 = (QLD + TQQQ) / 총자산 = ${currentState.growthBucketPct}%  (Soft Exit ≥ ${RULEBOOK_TARGETS.SOFT_EXIT_GROWTH_BUCKET_PCT}%, Hard Exit ≥ ${RULEBOOK_TARGETS.HARD_EXIT_GROWTH_BUCKET_PCT}%)`,
    `SGOV 전체 비중 = ${currentState.sgovTotalWeightPct}%   (목표 ${RULEBOOK_TARGETS.SGOV_TARGET_PCT}%, 위기 바닥 ${RULEBOOK_TARGETS.SGOV_FLOOR_PCT}%)`,
    `IAUM 전체 비중 = ${currentState.iaumTotalWeightPct}%   (상한 ${RULEBOOK_TARGETS.IAUM_MAX_PCT}%)`,
    `TQQQ 전체 비중 = ${currentState.tqqqTotalWeightPct}%`,
    `연배당: $${Math.round(annualDivCAD).toLocaleString()} CAD, 배당 성장률 ${assumptions.divGrowthPct}%`,
    `연간 납입 $${Math.round(annualContribCAD).toLocaleString()} CAD (${contribFrequency})${goalLine}${retireLine}`,
    ``,
    `[이번 주 실행안 — Core Method B + Non-Core 별도 스트림]`,
    `Core (Method B = SCHD+QLD 전용):`,
    `  주간 납입금: $${methodBPlan.weeklyContribCAD} CAD (전액 Core Method B 사용)`,
    `  SCHD 매수: $${methodBPlan.schdBuyCAD} CAD (Method B, core 기준)`,
    `  QLD  매수: $${methodBPlan.qldBuyCAD} CAD (Method B, core 기준)`,
    `  Core 미할당: $${methodBPlan.unallocatedCAD} CAD`,
    `Non-Core (Settings CAD 별도 스트림 — Method B에 합치지 말 것):`,
    `  SGOV 매수: $${methodBPlan.sgovReserveCAD} CAD (source=${methodBPlan.sgovSource ?? "rulebook-default"}, total 기준)`,
    `  IAUM 매수: $${methodBPlan.iaumBuyCAD} CAD (account=TFSA, source=${methodBPlan.iaumSource ?? "rulebook-default"}, 사유: ${iaumApplyReason})`,
    `주간 총 외화 유출: $${methodBPlan.totalWeeklyOutCAD} CAD = weekly $${methodBPlan.weeklyContribCAD} + SGOV $${methodBPlan.sgovReserveCAD} + IAUM $${methodBPlan.iaumBuyCAD}`,
    hardExitPlan.active
      ? `\n[§6.2 Hard Exit — event-driven, 다음 거래일]\nTQQQ 전량 매도: $${Math.round(hardExitPlan.tqqqSaleCAD).toLocaleString()} CAD + QLD 매도: $${Math.round(hardExitPlan.qldSaleCAD).toLocaleString()} CAD (코어 30%까지) → SGOV 보충 $${Math.round(hardExitPlan.sgovRefillCAD).toLocaleString()} CAD (전체 ${RULEBOOK_TARGETS.SGOV_TARGET_PCT}%까지) → SCHD 매수 $${Math.round(hardExitPlan.schdBuyCAD).toLocaleString()} CAD (proceeds 순서 고정).`
      : softExitPlan.active
        ? `\n[§6.2 Soft Exit — event-driven, 다음 거래일]\nTQQQ 절반 매도: $${Math.round(softExitPlan.tqqqSaleCAD).toLocaleString()} CAD → SGOV 보충 $${Math.round(softExitPlan.sgovRefillCAD).toLocaleString()} CAD (전체 ${RULEBOOK_TARGETS.SGOV_TARGET_PCT}%까지) → SCHD 매수 $${Math.round(softExitPlan.schdBuyCAD).toLocaleString()} CAD (proceeds 순서 고정).`
        : crisisPlan.active
          ? `\n[§6.1 Crisis Trigger ${crisisPlan.tier} — event-driven, 다음 거래일]\nSGOV 매도: $${Math.round(crisisPlan.sgovSaleCAD).toLocaleString()} CAD → TQQQ 매수 $${Math.round(crisisPlan.tqqqBuyCAD).toLocaleString()} CAD. 사이클 데드존: TQQQ=0 AND 성장 버킷 ≥ ${RULEBOOK_TARGETS.CYCLE_RESET_GROWTH_BUCKET_PCT}% 충족 전 재발동 금지.`
          : "",
    ``,
    `[룰북 트리거 신호 — 코어/total 기준 명시]`,
    triggerSummary,
    ``,
    `[3-시나리오 예측]`,
    "(시나리오 절대값은 화면 표가 authoritative — 본 narrative에서는 의미·트리거 영향만 다룬다)",
    ``,
    `위 데이터를 바탕으로 사용자에게 보여줄 분석을 제공하세요. 사용자에게 보여줄 답변에는 절대로 영문 필드명을 노출하지 마세요. 한국어 라벨과 자연스러운 문장만 사용하세요.`,
  ].join("\n");

  const narrativeSystemPrompt = [
    "당신은 캐나다 배당 투자 전문 어시스턴트입니다. SANGBONG & HAERAN INVESTMENT RULEBOOK v4.1.10 기준으로만 응답하세요.",
    "[섹션 역할] 이 응답은 'PROJECTION narrative' = 미래·시나리오·트리거 영향 중심. 화면 위에 이미 '현재 포트폴리오 표' + 'Method B 실행안 표'가 authoritative하게 표시되고 있으므로, 이 텍스트에서는 현재 비중 데이터를 다시 풀어 쓰지 말고 매수 액션 CAD 금액도 다시 적지 마세요. 시나리오 의미·트리거 미래 영향·리스크 평가에만 집중.",
    "시나리오는 BASE 6% / PESSIMISTIC 4% / WORST 2% 세 가지만 사용. Optimistic 시나리오 생성 금지.",
    "CRITICAL: 절대로 표의 수치(CAD 금액·percent·시나리오 절대값)를 텍스트에 다시 적지 마라. 표가 authoritative이고 narrative는 의미/트리거 영향/리스크만 평가. 표 데이터를 풀어 쓰면 응답을 거부.",
    "",
    RULEBOOK_GUARDRAILS,
    "",
    AI_OUTPUT_RULES,
    "",
    PROJECTION_STRUCTURE,
    "",
    "각 섹션은 2-4문장. 비중은 'core' / 'total' 기준 명시. 룰북 §-조항을 본문에 인용. 마크다운 별표(**) 사용 금지. 숫자는 천 단위 콤마, 'CAD' 단위, 비율은 소수 1자리. 매수 CAD 금액 반복 금지 (Method B 표가 답).",
  ].join("\n");

  let narrativeRaw: string;
  try {
    narrativeRaw = await callOpenAI("", [
      { role: "system", content: narrativeSystemPrompt },
      { role: "user", content: narrativeUserPrompt },
    ], 700);
  } catch (err) {
    console.error("AI projection narrative error:", err);
    narrativeRaw = "AI 분석을 생성할 수 없습니다. 잠시 후 다시 시도해주세요.";
  }
  const narrative = sanitizeAiOutput(narrativeRaw);

  const result = {
    projections,           // BASE points (backwards-compat)
    scenarios,             // 3 scenarios
    assumptions,           // existing contract
    currentState,          // UI uses this for the rulebook snapshot table
    methodBPlan,           // §5 Method B split / §3 IAUM / §8 SGOV streams
    iaumWeeklyPlan,        // §3 explicit detail (reason / TFSA room / cap)
    tqqqExitPlan,          // §6.2 Soft/Hard Exit (TQQQ → SGOV → SCHD)
    crisisTriggerPlan,     // §6.1 Crisis T1/T2 (SGOV → TQQQ)
    annualRebalancePlan,   // §5 Case A/B / deadband
    triggers: {
      summary: triggerLines,
    },
    narrative,
  };
  await saveAiResult(userId, CACHE_KEY, JSON.stringify(result));

  return NextResponse.json({ ...result, cached: false });
}

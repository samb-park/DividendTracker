import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getPrice, getFxRate } from "@/lib/price";
import {
  callOpenAIWithMeta,
  getCachedAiResult,
  saveAiResult,
} from "@/lib/openai";
import {
  computeRulebookWeights,
  computeStaticCoreAllocation,
  computeQqqmWeeklyPlan,
  computeQqqmCumulative,
  computeQqqmAnnualSkim,
  computeNextQqqmSkimDate,
  computeTqqqHardExitPlan,
  computeTqqqSoftExitPlan,
  computeCrisisTriggerPlan,
  computeAnnualRebalancePlan,
  projectScenariosRulebook,
  RULEBOOK_SCENARIOS,
  RULEBOOK_TARGETS,
} from "@/lib/rulebook";
import { AI_OUTPUT_RULES, PROJECTION_STRUCTURE, RULEBOOK_GUARDRAILS, RULEBOOK_PROMPT_VERSION, sanitizeAiOutput } from "@/lib/ai-output-rules";
import { checkAiThrottle } from "@/lib/ai-throttle";
import { recordAiCall } from "@/lib/audit/aiCallLog";
import { ensureCurrentRulebookVersion } from "@/lib/audit/rulebookVersionOnce";
import { validateAiOutput } from "@/lib/ai-validation/validateAiOutput";

export const dynamic = "force-dynamic";

const ROUTE = "ai/projection";

const DEFAULT_FX = 1.38;
const CACHE_KEY = `ai_projection_${RULEBOOK_PROMPT_VERSION}_performance_baseline_v5`;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  // Fire-and-forget: register the active rulebook version on first AI call of
  // this process. Memoised internally; never blocks the route.
  void ensureCurrentRulebookVersion();

  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force) {
    const cachedStr = await getCachedAiResult(userId, CACHE_KEY);
    if (cachedStr) {
      try {
        const parsed = JSON.parse(cachedStr) as { currentState?: unknown; narrative?: string };
        // Old cache lacking currentState (pre-snapshot UI) → force recompute instead of returning broken shape.
        if (parsed.currentState) {
          void recordAiCall({
            userId,
            route: ROUTE,
            provider: "cache",
            model: "cache",
            rulebookVersion: RULEBOOK_PROMPT_VERSION,
            systemPromptHash: "cache",
            userQueryHash: null,
            contextSizeChars: null,
            cached: true,
            status: "ok",
            httpStatus: 200,
            durationMs: 0,
            sanitizedResponse: parsed.narrative ?? null,
          });
          return NextResponse.json({ ...parsed, cached: true });
        }
      } catch { /* fall through to recompute */ }
    }
  }

  const throttle = checkAiThrottle(userId);
  if (!throttle.allowed) {
    void recordAiCall({
      userId,
      route: ROUTE,
      provider: "n/a",
      model: "n/a",
      rulebookVersion: RULEBOOK_PROMPT_VERSION,
      systemPromptHash: "n/a",
      userQueryHash: null,
      contextSizeChars: null,
      cached: false,
      status: "throttled",
      httpStatus: 429,
      durationMs: 0,
    });
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
    void recordAiCall({
      userId,
      route: ROUTE,
      provider: "n/a",
      model: "n/a",
      rulebookVersion: RULEBOOK_PROMPT_VERSION,
      systemPromptHash: "n/a",
      userQueryHash: null,
      contextSizeChars: null,
      cached: false,
      status: "computation_error",
      httpStatus: 500,
      durationMs: 0,
      errorMessage: message,
    });
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

  const [snapshots, dividendsThisYear, dividendsPrevYear, holdingsRaw, contribPlanSetting, investorProfileSetting, fxSetting, incomGoalSetting, contribRoomSetting, cashTxThisYear, cashTxAll, fxLive, targetSettings, projAssumptionsSetting, qqqmTxAll] =
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
        where: { isActive: true, quantity: { gt: 0 }, portfolio: { userId } },
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
      prisma.cashTransaction.findMany({
        where: { portfolio: { userId } },
        select: { date: true, action: true, amount: true, currency: true },
        orderBy: { date: "asc" },
      }),
      getFxRate().catch(() => null),
      prisma.setting.findMany({ where: { key: { startsWith: `${userId}:investment:target:` } } }),
      prisma.setting.findUnique({ where: { key: `${userId}:investment:projection_assumptions` } }),
      // v4.5.0: QQQM BUY transactions retained only for legacy cost/holding context; no rulebook skim.
      prisma.transaction.findMany({
        where: {
          action: "BUY",
          holding: { ticker: "QQQM", portfolio: { userId } },
        },
        select: { quantity: true, price: true, commission: true },
      }),
    ]);

  const fxFromSetting = fxSetting ? (parseFloat(fxSetting.value) || DEFAULT_FX) : DEFAULT_FX;
  const fxRate = fxLive && !fxLive.fallback ? fxLive.rate : fxFromSetting;
  const contributionEventsCAD = cashTxAll
    .map((tx) => {
      const signedAmount = parseFloat(tx.amount.toString()) * (tx.action === "WITHDRAWAL" ? -1 : 1);
      const amountCAD = signedAmount * (tx.currency === "USD" ? fxRate : 1);
      return {
        date: tx.date.toISOString().slice(0, 10),
        amountCAD: Math.round(amountCAD * 100) / 100,
      };
    })
    .filter((event) => Number.isFinite(event.amountCAD) && event.amountCAD !== 0);

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
  const qqqmUserCAD = nonCoreCADByTicker["QQQM"];
  const sgovSourceLabel: "user-settings" | "rulebook-default" | "rulebook-inactive" =
    sgovUserCAD && sgovUserCAD > 0 ? "user-settings" : "rulebook-inactive";
  // qqqmSourceLabel resolved after rule-default check below.

  // Core: full weekly contribution → STATIC 60/40 (v4.5.0). No TQQQ overlay.
  const overlayActive = false;
  const core = computeStaticCoreAllocation(weeklyContribCAD, overlayActive);
  const coreContribCAD = core.schdBuyCAD + core.qldBuyCAD + core.tqqqBuyCAD;

  // SGOV (v4.5.0): user-settings only — no rulebook-default weekly refill.
  // SGOV refill also receives year-end trim proceeds where applicable.
  const sgovUserSet = !!(sgovUserCAD && sgovUserCAD > 0);
  const sgovReserveCAD = sgovUserSet ? sgovUserCAD! : 0;

  // QQQM (v4.5.0): legacy/hold-only. Ignore user-settings CAD for new-buy guidance.
  void qqqmUserCAD;
  const qqqmPlan = computeQqqmWeeklyPlan(tfsaRoomExists);
  const qqqmActualCAD = 0;
  const qqqmSourceLabel: "user-settings" | "rulebook-default" | "rulebook-inactive" = "rulebook-inactive";
  const qqqmApplyReason = qqqmPlan.reason;

  const totalWeeklyOutCAD = weeklyContribCAD + sgovReserveCAD + qqqmActualCAD;

  // QQQM cumulative USD cost basis + shares (legacy context only; v4.5.0 skim removed).
  const qqqmCumulative = computeQqqmCumulative(
    qqqmTxAll.map(tx => ({
      action: "BUY" as const,
      ticker: "QQQM",
      quantity: parseFloat(tx.quantity.toString()),
      price: parseFloat(tx.price.toString()),
      commission: parseFloat(tx.commission?.toString() ?? "0"),
    })),
  );
  // Live QQQM USD close = (CAD value / shares) / fxRate when shares > 0. Best-effort,
  // marked unverified when no live price was found.
  const qqqmCurrentCadValue = weights.qqqmCAD;
  const qqqmCloseUsd = qqqmCumulative.cumulativeShares > 0 && fxRate > 0
    ? (qqqmCurrentCadValue / fxRate) / qqqmCumulative.cumulativeShares
    : 0;
  const qqqmSkimEvaluation = computeQqqmAnnualSkim({
    cumulativeCostUsd: qqqmCumulative.cumulativeCostUsd,
    cumulativeShares: qqqmCumulative.cumulativeShares,
    closeUsd: qqqmCloseUsd,
    totalCAD: currentValueCAD,
    sgovCAD: weights.sgovCAD,
    fxUsdToCad: fxRate,
  });
  const nextSkim = computeNextQqqmSkimDate(now);
  const qqqmAnnualSkimPlan = {
    nextSkimDateISO: nextSkim.nextSkimDateISO,
    isPostponed: nextSkim.isPostponed,
    postponeReason: nextSkim.postponeReason,
    daysUntilSkim: nextSkim.daysUntilSkim,
    cumulativeCostUsd: Math.round(qqqmCumulative.cumulativeCostUsd * 100) / 100,
    cumulativeShares: Math.round(qqqmCumulative.cumulativeShares * 1000000) / 1000000,
    estimatedSkimAmountUsd: qqqmSkimEvaluation.eligible
      ? Math.round(qqqmSkimEvaluation.skimAmountUsd * 100) / 100
      : 0,
    eligibilityHint: qqqmSkimEvaluation.eligible ? "profitable" : qqqmSkimEvaluation.reason,
    pUsdAvg: Math.round(qqqmSkimEvaluation.pUsdAvg * 100) / 100,
    vUsd: Math.round(qqqmSkimEvaluation.vUsd * 100) / 100,
  };

  // v4.5.0 event plans: retired TQQQ exit compatibility (always inactive), Crisis SGOV → QLD, Annual Rebalance.
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
    cycleArmed: weights.cycleArmable,
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

  // Per-asset yields. SCHD/QLD/SGOV use rough ETF averages.
  // Document as model assumption — actual yields depend on holdings/distributions.
  const SCHD_TYPICAL_YIELD_PCT = 3.5;
  const QLD_TYPICAL_YIELD_PCT  = 0.5;
  const SGOV_TYPICAL_YIELD_PCT = 4.5;
  // v4.5.0: QQQM (Invesco Nasdaq-100) yield ≈ 0.7% (broad equity, NOT the 8% covered-call QQQI default).
  const QQQM_TYPICAL_YIELD_PCT = 0.7;

  const scenarios = projectScenariosRulebook({
    start: {
      schdCAD: weights.schdCAD,
      qldCAD:  weights.qldCAD,
      sgovCAD: weights.sgovCAD,
      qqqmCAD: weights.qqqmCAD,
      tqqqCAD: weights.tqqqCAD,
      schdYieldPct: SCHD_TYPICAL_YIELD_PCT,
      qldYieldPct:  QLD_TYPICAL_YIELD_PCT,
      sgovYieldPct: SGOV_TYPICAL_YIELD_PCT,
      qqqmYieldPct: QQQM_TYPICAL_YIELD_PCT,
    },
    coreWeeklyCAD: weeklyContribCAD,
    sgovWeeklyCAD: nonCoreCADByTicker["SGOV"] ?? 0,
    qqqmWeeklyCAD: nonCoreCADByTicker["QQQM"] ?? 0,
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
    qqqmCAD:             Math.round(weights.qqqmCAD),
    tqqqCAD:             Math.round(weights.tqqqCAD),
    qldCoreWeightPct:    Math.round(weights.qldCoreWeightPct  * 10) / 10,
    schdCoreWeightPct:   Math.round(weights.schdCoreWeightPct * 10) / 10,
    growthBucketPct:     Math.round(weights.growthBucketPct   * 10) / 10,
    sgovTotalWeightPct:  Math.round(weights.sgovTotalWeightPct * 10) / 10,
    qqqmTotalWeightPct:  Math.round(weights.qqqmTotalWeightPct * 10) / 10,
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
      sgovAboveMax:    weights.sgovAboveMax,
      overlayActive,
    },
  };

  const coreAllocationPlan = {
    weeklyContribCAD:  Math.round(weeklyContribCAD),
    coreContribCAD:    Math.round(coreContribCAD),
    schdBuyCAD:        Math.round(core.schdBuyCAD),
    qldBuyCAD:         Math.round(core.qldBuyCAD),
    tqqqBuyCAD:        Math.round(core.tqqqBuyCAD),
    overlayActive,
    // Satellite: SEPARATE/ADDITIVE streams (not subtracted from weeklyContribCAD).
    sgovReserveCAD:    Math.round(sgovReserveCAD),
    qqqmCashAccumCAD:  Math.round(qqqmActualCAD),
    sgovSource:        sgovSourceLabel,
    qqqmSource:        qqqmSourceLabel,
    totalWeeklyOutCAD: Math.round(totalWeeklyOutCAD),
  };

  const qqqmWeeklyPlan = {
    qqqmRuleCashAccumCAD:   qqqmPlan.qqqmCashAccumCAD,    // 룰이 요구하는 금액 (45 또는 0)
    qqqmActualCashAccumCAD: Math.round(qqqmActualCAD),    // 이번 주 실제 CAD 누적
    redirectedToCoreCAD:    qqqmPlan.redirectedToCoreCAD,
    reason:                 qqqmApplyReason,
    tfsaRoomExists:         qqqmPlan.tfsaRoomExists,
    account:                "Sangbong TFSA",
    weeklyDefaultCAD:       0,
  };

  // v4.5.0: Soft Exit / Emergency cap removed; keep inactive response shape for old UI clients.
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
          qldSaleCAD:          0,
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
        tqqqBuyCAD:             0,
        qldBuyCAD:              Math.round(crisisPlan.qldBuyCAD),
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
    annualContribCAD: Math.round(totalWeeklyOutCAD * 52),
    weeklyContribCAD: Math.round(totalWeeklyOutCAD),
    contributionEventsCAD,
    contribFrequency,
    currentValueCAD: Math.round(currentValueCAD),
    currentAnnualDivCAD: Math.round(annualDivCAD),
    retirementYear,
    rulebookVersion: "v4.5.0",
  };

  // ── AI narrative ──
  // Provide structured numbers in the prompt and require Korean labels in output.
  const goalLine = incomeGoalCAD ? `\n목표 연배당: $${Math.round(incomeGoalCAD).toLocaleString()} CAD` : "";
  const retireLine = retirementYear ? `\n은퇴 목표: ${retirementYear}년 (${yearsToRetirement}년 후)` : "";

  const triggerLines: string[] = [];
  // v4.5.0 removed Soft Exit / Emergency cap; no growth-bucket exit trigger lines.
  if (weights.crisisT1 && !weights.crisisT2)
    triggerLines.push(`- §6.1 Crisis T1 (코어 W ≤ ${RULEBOOK_TARGETS.CRISIS_T1_PCT}%, MONTH-END close): 현재 ${currentState.qldCoreWeightPct}% (코어 기준) — SGOV 매도 → QLD 매수 (총자산의 ${RULEBOOK_TARGETS.CRISIS_T1_BUY_PCT_OF_TOTAL}%, SGOV 0%까지 소진 가능 — 바닥 없음). QQQM 매도 절대 금지. 사이클 재무장 시에만 발동.`);
  if (weights.crisisT2)
    triggerLines.push(`- §6.1 Crisis T2 (코어 W ≤ ${RULEBOOK_TARGETS.CRISIS_T2_PCT}%, MONTH-END close): 현재 ${currentState.qldCoreWeightPct}% (코어 기준) — SGOV 추가 매도 → QLD 매수 (T1+T2 누적 총자산의 ${RULEBOOK_TARGETS.CRISIS_T1_BUY_PCT_OF_TOTAL + RULEBOOK_TARGETS.CRISIS_T2_BUY_PCT_OF_TOTAL}%, SGOV 0%까지 소진 가능). QQQM 매도 절대 금지. 같은 거래일 동시 실행 가능.`);
  if (weights.caseAEligible)
    triggerLines.push(`- §5 Case A (W > ${RULEBOOK_TARGETS.REBAL_HIGH_PCT}%): 현재 ${currentState.qldCoreWeightPct}% (코어 기준) — 연말(Dec 31) QLD 매도 → SGOV ${RULEBOOK_TARGETS.SGOV_MAX_PCT}% → SCHD. SCHD 매도 금지.`);
  if (weights.caseBEligible)
    triggerLines.push(`- §5 Case B (W < ${RULEBOOK_TARGETS.REBAL_LOW_PCT}% AND TQQQ=0): 현재 ${currentState.qldCoreWeightPct}% (코어 기준) — v4.4.2+에서는 무행동. SCHD 매도하여 QLD 매수 금지.`);
  if (weights.inDeadband)
    triggerLines.push(`- §5 데드밴드 (${RULEBOOK_TARGETS.REBAL_LOW_PCT} ≤ W ≤ ${RULEBOOK_TARGETS.REBAL_HIGH_PCT}): 현재 ${currentState.qldCoreWeightPct}% (코어 기준) — 연말 리밸런스 무행동.`);
  if (weights.sgovBelowTarget)
    triggerLines.push(`- §8 SGOV 베이스 미달 (base ${RULEBOOK_TARGETS.SGOV_BASE_TARGET_PCT}%): 현재 ${currentState.sgovTotalWeightPct}% (total 기준) — 별도 SGOV 보충 필요액을 직접 계산.`);
  if (weights.sgovAboveMax)
    triggerLines.push(`- §8 SGOV 상한 초과 (max ${RULEBOOK_TARGETS.SGOV_MAX_PCT}%): 현재 ${currentState.sgovTotalWeightPct}% (total 기준) — 8% 초과 상태는 별도 확인 필요.`);
  if (overlayActive)
    triggerLines.push(`- §5 Core 분배: v4.5.0에서는 TQQQ 오버레이 없음. 이번 주 Core는 SCHD 60 / QLD 40.`);
  // v4.5.0: no QQQM weekly accumulation or annual skim trigger.
  const triggerSummary = triggerLines.length ? triggerLines.join("\n") : "특이 신호 없음 (정상 운용)";

  const narrativeUserPrompt = [
    `[현재 포트폴리오]`,
    `총 평가금액: $${Math.round(currentValueCAD).toLocaleString()} CAD`,
    `코어 평가금액: $${currentState.coreCAD.toLocaleString()} CAD (SCHD $${currentState.schdCAD.toLocaleString()} + QLD $${currentState.qldCAD.toLocaleString()})`,
    `QLD 코어 비중 = QLD / (SCHD + QLD) = ${currentState.qldCAD.toLocaleString()} / ${currentState.coreCAD.toLocaleString()} = ${currentState.qldCoreWeightPct}%`,
    `SCHD 코어 비중 = ${currentState.schdCoreWeightPct}%`,
    `성장 버킷 비중 = (QLD + TQQQ) / 총자산 = ${currentState.growthBucketPct}%  (v4.5.0: Soft Exit/Emergency cap 폐지)`,
    `SGOV 전체 비중 = ${currentState.sgovTotalWeightPct}%   (base ${RULEBOOK_TARGETS.SGOV_BASE_TARGET_PCT}%, max ${RULEBOOK_TARGETS.SGOV_MAX_PCT}%, min ${RULEBOOK_TARGETS.SGOV_MIN_PCT}% — 바닥 없음, 위기 시 0%까지 소진 가능)`,
    `QQQM 전체 비중 = ${currentState.qqqmTotalWeightPct}%   (legacy hold-only, 신규 매수/12월31일 skim 없음)`,
    `QQQM 누적 USD cost basis = $${qqqmAnnualSkimPlan.cumulativeCostUsd} USD, 누적 shares = ${qqqmAnnualSkimPlan.cumulativeShares} (legacy tracking only)`,
    `TQQQ 전체 비중 = ${currentState.tqqqTotalWeightPct}%`,
    `연배당: $${Math.round(annualDivCAD).toLocaleString()} CAD, 배당 성장률 ${assumptions.divGrowthPct}%`,
    `연간 납입 $${Math.round(annualContribCAD).toLocaleString()} CAD (${contribFrequency})${goalLine}${retireLine}`,
    ``,
    `[이번 주 실행안 — Core 정적 60/40 + Satellite 별도 스트림]`,
    `Core (정상: SCHD 60 / QLD 40):`,
    `  주간 납입금: $${coreAllocationPlan.weeklyContribCAD} CAD (전액 Core 정적 60/40 사용)`,
    `  SCHD 매수: $${coreAllocationPlan.schdBuyCAD} CAD`,
    `  QLD  매수: $${coreAllocationPlan.qldBuyCAD} CAD`,
    `  TQQQ VR-Lite 매수: 별도 Friday drawdown tier에서 판단 (Core 분배 아님)`,
    `Satellite (Settings CAD 별도 스트림):`,
    `  SGOV 매수: $${coreAllocationPlan.sgovReserveCAD} CAD (source=${coreAllocationPlan.sgovSource ?? "rulebook-inactive"}, total 기준; v4.5.0: 주간 contribution 없음, 사용자 Settings만 활성)`,
    `  QQQM 신규 매수: $0 CAD (legacy hold-only, 사유: ${qqqmApplyReason})`,
    `주간 총 외화 유출: $${coreAllocationPlan.totalWeeklyOutCAD} CAD = weekly $${coreAllocationPlan.weeklyContribCAD} + SGOV $${coreAllocationPlan.sgovReserveCAD} + QQQM $0`,
    crisisPlan.active
      ? `\n[§6.1 Crisis Trigger ${crisisPlan.tier} — month-end close, 다음 거래일]\nSGOV 매도: $${Math.round(crisisPlan.sgovSaleCAD).toLocaleString()} CAD → QLD 매수 $${Math.round(crisisPlan.qldBuyCAD).toLocaleString()} CAD. SGOV 0%까지 소진 가능. QQQM 매도 절대 금지. reset = QLD core weight ≥ ${RULEBOOK_TARGETS.CRISIS_RESET_QLD_CORE_WEIGHT_PCT}%.`
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
    "당신은 캐나다 배당 투자 전문 어시스턴트입니다. SANGBONG & HAERAN INVESTMENT RULEBOOK v4.5.0 기준으로만 응답하세요.",
    "[섹션 역할] 이 응답은 'PROJECTION narrative' = 미래·시나리오·트리거 영향 중심. 화면 위에 이미 '현재 포트폴리오 표' + '실행안 표'가 authoritative하게 표시되고 있으므로, 이 텍스트에서는 현재 비중 데이터를 다시 풀어 쓰지 말고 매수 액션 CAD 금액도 다시 적지 마세요. 시나리오 의미·트리거 미래 영향·리스크 평가에만 집중.",
    "시나리오는 BASE 6% / PESSIMISTIC 4% / WORST 2% 세 가지만 사용. Optimistic 시나리오 생성 금지.",
    "CRITICAL: 절대로 표의 수치(CAD 금액·percent·시나리오 절대값)를 텍스트에 다시 적지 마라. 표가 authoritative이고 narrative는 의미/트리거 영향/리스크만 평가. 표 데이터를 풀어 쓰면 응답을 거부.",
    "v4.5.0 핵심: (1) Core 주간 455 CAD = SCHD 273 / QLD 182 정적 60/40 (Method B 폐지). (2) Satellite = SGOV (passive 예비, base 5% / max 8% / min 0% — 바닥 없음) + QQQM (active 위성, Sangbong TFSA only, QQQM 신규 매수 없음). (3) QQQI / JEPQ / IAUM은 inert legacy (신규 매수 금지). (4) TQQQ Soft Exit/Emergency cap 폐지. QQQM 신규 매수 없음. (5) §6.1 Crisis Trigger는 month-end close, SGOV 0%까지 소진 가능, QQQM 매도 절대 금지. (6) SCHD 배당 재투자도 정적 60/40. (7) QQQM 신규 매수/skim/분기 매도 금지. (8) 연말: TQQQ profit sweep → Core 60/40, Core overshoot trim → SGOV.",
    "",
    RULEBOOK_GUARDRAILS,
    "",
    AI_OUTPUT_RULES,
    "",
    PROJECTION_STRUCTURE,
    "",
    "각 섹션은 2-4문장. 비중은 'core' / 'total' 기준 명시. 룰북 §-조항을 본문에 인용. 마크다운 별표(**) 사용 금지. 숫자는 천 단위 콤마, 'CAD' 단위, 비율은 소수 1자리. 매수 CAD 금액 반복 금지 (실행안 표가 답). 수익률 보장 표현 금지.",
  ].join("\n");

  const systemPromptHash = sha256Hex(narrativeSystemPrompt);
  const FALLBACK_NARRATIVE = "AI 분석을 생성할 수 없습니다. 잠시 후 다시 시도해주세요.";

  const callStarted = Date.now();
  const aiResult = await callOpenAIWithMeta(
    [
      { role: "system", content: narrativeSystemPrompt },
      { role: "user", content: narrativeUserPrompt },
    ],
    { maxTokens: 700 },
  );
  const durationMs = Date.now() - callStarted;

  let narrativeRaw: string;
  if (aiResult.ok) {
    narrativeRaw = aiResult.content;
  } else {
    console.error("AI projection narrative error:", aiResult.error.message);
    // Preserve existing behaviour: fall through with fallback narrative, save
    // the (partial) result to cache, and return a normal 200 response. The
    // recordAiCall row classifies this as upstream_error so dashboards can
    // distinguish it from genuine successes.
    narrativeRaw = FALLBACK_NARRATIVE;
  }
  const narrative = sanitizeAiOutput(narrativeRaw);
  const validation = validateAiOutput(
    ROUTE,
    aiResult.ok ? aiResult.rawResponse : narrativeRaw,
    narrative,
    { rulebookVersion: RULEBOOK_PROMPT_VERSION },
  );

  if (aiResult.ok) {
    void recordAiCall({
      userId,
      route: ROUTE,
      provider: aiResult.meta.provider,
      model: aiResult.meta.model,
      rulebookVersion: RULEBOOK_PROMPT_VERSION,
      systemPromptHash,
      userQueryHash: null,
      contextSizeChars: narrativeUserPrompt.length,
      cached: false,
      status: "ok",
      httpStatus: aiResult.meta.httpStatus,
      durationMs,
      upstreamDurationMs: aiResult.meta.upstreamDurationMs,
      promptTokens: aiResult.meta.promptTokens,
      completionTokens: aiResult.meta.completionTokens,
      totalTokens: aiResult.meta.totalTokens,
      // recordAiCall enforces AI_AUDIT_STORE_RAW=true to actually persist this.
      rawResponse: aiResult.rawResponse,
      sanitizedResponse: narrative,
      validatedAt: new Date(),
      validationStatus: validation.ok ? "pass" : "violation",
      violationCodes: validation.violations.map((v) => v.code),
      errorMessage: validation.ok
        ? undefined
        : validation.violations.map((v) => `${v.code}: ${v.reason}`).join("; "),
    });
  } else {
    void recordAiCall({
      userId,
      route: ROUTE,
      provider: aiResult.meta.provider,
      model: aiResult.meta.model,
      rulebookVersion: RULEBOOK_PROMPT_VERSION,
      systemPromptHash,
      userQueryHash: null,
      contextSizeChars: narrativeUserPrompt.length,
      cached: false,
      status: "upstream_error",
      httpStatus: aiResult.error.httpStatus ?? 500,
      durationMs,
      upstreamDurationMs: aiResult.meta.upstreamDurationMs,
      errorMessage: aiResult.error.message,
      // sanitizedResponse mirrors what the user sees in the response payload.
      sanitizedResponse: FALLBACK_NARRATIVE,
      validatedAt: new Date(),
      validationStatus: validation.ok ? "pass" : "violation",
      violationCodes: validation.violations.map((v) => v.code),
    });
  }

  const result = {
    projections,           // BASE points (backwards-compat)
    scenarios,             // 3 scenarios
    assumptions,           // existing contract
    currentState,          // UI uses this for the rulebook snapshot table
    coreAllocationPlan,    // §5 static 60/40 split / §8 SGOV stream / QQQM hold-only
    qqqmWeeklyPlan,        // §4 legacy hold-only / no-new-buy detail
    qqqmAnnualSkimPlan,    // §4 legacy compatibility shape; v4.5.0 always no-skim
    tqqqExitPlan,          // legacy compatibility shape; v4.5.0 Soft/Emergency exits removed
    crisisTriggerPlan,     // §6.1 Crisis T1/T2 (SGOV → QLD; SGOV may exhaust to 0%)
    annualRebalancePlan,   // §5 Case A/B / deadband
    triggers: {
      summary: triggerLines,
    },
    narrative,
  };
  await saveAiResult(userId, CACHE_KEY, JSON.stringify(result));

  return NextResponse.json({ ...result, cached: false });
}

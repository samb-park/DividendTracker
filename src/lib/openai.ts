import { prisma } from "@/lib/db";
import { getPrice, getFxRate } from "@/lib/price";
import { decrypt, isEncrypted } from "@/lib/crypto";
import {
  computeRulebookWeights,
  computeMethodBAllocation,
  computeIaumWeeklyPlan,
  computeTqqqHardExitPlan,
  RULEBOOK_TARGETS,
} from "@/lib/rulebook";

const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_FX_RATE = parseFloat(process.env.DEFAULT_FX_RATE ?? "1.35");

// ── AI provider call ─────────────────────────────────────────────────────────

type AiProvider = "hermes" | "openrouter" | "openai" | "github";

export interface AiProviderConfig {
  provider: AiProvider;
  endpoint: string;
  model: string;
  token: string;
}

export function resolveAiProviderConfig(): AiProviderConfig {
  const requestedProvider = process.env.AI_PROVIDER?.toLowerCase();
  const hermesToken = process.env.HERMES_API_KEY ?? process.env.AI_API_KEY ?? "";
  const openRouterToken = process.env.OPENROUTER_API_KEY;
  const openAiToken = process.env.OPENAI_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;

  if (requestedProvider === "hermes") {
    return {
      provider: "hermes",
      endpoint: process.env.AI_ENDPOINT ?? "http://100.88.130.67:8642/v1/chat/completions",
      model: process.env.AI_MODEL ?? "hermes-agent",
      token: hermesToken,
    };
  }

  if ((requestedProvider === "openrouter" || !requestedProvider) && openRouterToken) {
    return {
      provider: "openrouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      model: process.env.AI_MODEL ?? "openai/gpt-5.5",
      token: openRouterToken,
    };
  }

  if ((requestedProvider === "openai" || !requestedProvider) && openAiToken) {
    return {
      provider: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: process.env.AI_MODEL ?? "gpt-5.5",
      token: openAiToken,
    };
  }

  if ((requestedProvider === "github" || !requestedProvider) && githubToken) {
    return {
      provider: "github",
      endpoint: "https://models.inference.ai.azure.com/chat/completions",
      model: process.env.AI_MODEL ?? "gpt-4o-mini",
      token: githubToken,
    };
  }

  throw new Error("No AI provider configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, or GITHUB_TOKEN.");
}

export async function callOpenAI(
  _apiKey: string,
  messages: { role: string; content: string }[],
  maxTokens = 400
): Promise<string> {
  const config = resolveAiProviderConfig();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
  }
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXTAUTH_URL ?? "https://dividend.buildwith.work";
    headers["X-Title"] = "DividendTracker";
  }

  const res = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${config.provider} AI API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content?.trim() ?? "";
}

export async function callOpenAIWithFallback(
  apiKey: string,
  messages: { role: string; content: string }[],
  maxTokens = 400,
  fallback = "AI 응답을 가져오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
): Promise<string> {
  try {
    return await callOpenAI(apiKey, messages, maxTokens);
  } catch (err) {
    console.error("callOpenAI failed:", err);
    return fallback;
  }
}

// ── Portfolio context builder ─────────────────────────────────────────────────

function inferAccountType(name: string | null | undefined): string {
  const upper = (name ?? "").toUpperCase();
  if (upper.includes("RRSP")) return "RRSP";
  if (upper.includes("TFSA")) return "TFSA";
  if (upper.includes("FHSA")) return "FHSA";
  if (upper.includes("RESP")) return "RESP";
  if (upper.includes("MARGIN") || upper.includes("TAXABLE")) return "TAXABLE";
  return "UNKNOWN";
}

export async function buildPortfolioContext(userId: string): Promise<string> {
  const portfolios = (await prisma.portfolio.findMany({
    where: { userId },
    include: {
      holdings: {
        where: { quantity: { gt: 0 } },
        select: {
          ticker: true,
          currency: true,
          quantity: true,
          transactions: {
            select: { action: true, quantity: true, price: true, commission: true, date: true },
            orderBy: { date: "desc" },
          },
        },
      },
    },
  })) as unknown as Array<{
    name: string;
    holdings: Array<{
      ticker: string;
      currency: string;
      quantity: { toString(): string };
      transactions: Array<{
        action: string;
        quantity: { toString(): string };
        price: { toString(): string };
        date: Date;
        commission: { toString(): string };
      }>;
    }>;
  }>;

  // Fetch settings in parallel
  const thisYear = new Date().getFullYear();
  const [contribRoomSetting, investorProfileSetting, targetSettings, fxSetting, contribPlanSetting, cashTxThisYear] = await Promise.all([
    prisma.setting.findUnique({ where: { key: `${userId}:investment:contrib_room` } }),
    prisma.setting.findUnique({ where: { key: `${userId}:investment:investor_profile` } }),
    prisma.setting.findMany({ where: { key: { startsWith: `${userId}:investment:target:` } } }),
    prisma.setting.findUnique({ where: { key: "fx_rate_usd_cad" } }),
    prisma.setting.findUnique({ where: { key: `${userId}:investment:contribution` } }),
    prisma.cashTransaction.findMany({
      where: {
        portfolio: { userId },
        action: "DEPOSIT",
        date: { gte: new Date(`${thisYear}-01-01`) },
      },
      include: { portfolio: { select: { name: true } } },
    }),
  ]);

  // This-year deposits per account type
  let rrspDepositedThisYear = 0;
  let tfsaDepositedThisYear = 0;
  for (const tx of cashTxThisYear) {
    const acct = inferAccountType(tx.portfolio.name);
    const amt = parseFloat(tx.amount.toString());
    if (acct === "RRSP") rrspDepositedThisYear += amt;
    else if (acct === "TFSA") tfsaDepositedThisYear += amt;
  }

  // Parse contrib room
  const TFSA_ANNUAL_2026 = 7000;
  let tfsaCarryover = 0;
  let rrspRoom = 0;
  if (contribRoomSetting?.value) {
    try {
      const parsed = JSON.parse(contribRoomSetting.value) as { tfsaCarryover?: string | number; rrspLimit?: string | number };
      tfsaCarryover = parseFloat(String(parsed.tfsaCarryover ?? "0")) || 0;
      rrspRoom = parseFloat(String(parsed.rrspLimit ?? "0")) || 0;
    } catch { /* ignore */ }
  }

  // Parse target allocations: { "AAPL": 10, "VFV.TO": 20, ... }
  // Also capture Non-Core CAD plan for SGOV/IAUM (user-set, overrides rulebook defaults).
  const targetAlloc: Record<string, number> = {};
  const targetExcluded: Record<string, boolean> = {};
  const nonCoreCADByTicker: Record<string, number> = {};
  const targetPrefix = `${userId}:investment:target:`;
  for (const s of targetSettings) {
    const ticker = s.key.slice(targetPrefix.length).toUpperCase();
    try {
      const parsed = JSON.parse(s.value) as {
        pct?: number;
        excluded?: boolean;
        nonCorePlan?: { frequency?: string; cad?: number };
      };
      if (typeof parsed.pct === "number") targetAlloc[ticker] = parsed.pct;
      if (parsed.excluded) targetExcluded[ticker] = true;
      const cad = parsed.nonCorePlan?.cad;
      if (typeof cad === "number" && cad > 0 && !parsed.excluded) {
        nonCoreCADByTicker[ticker] = cad;
      }
    } catch { /* ignore */ }
  }

  // FX rate (track whether we ended up using a fallback to flag for the AI)
  const fxRateFromDB = fxSetting ? parseFloat(fxSetting.value) : null;
  let fxRate = fxRateFromDB && fxRateFromDB > 0 ? fxRateFromDB : DEFAULT_FX_RATE;
  let fxFallbackInUse = !(fxRateFromDB && fxRateFromDB > 0);
  try {
    const live = await getFxRate();
    if (!live.fallback) {
      fxRate = live.rate;
      fxFallbackInUse = false;
    } else {
      fxFallbackInUse = true;
    }
  } catch { fxFallbackInUse = true; }

  // Collect all unique tickers for price fetch
  const allTickers = Array.from(new Set(portfolios.flatMap(p => p.holdings.map(h => h.ticker))));
  const priceMap = new Map<string, Awaited<ReturnType<typeof getPrice>>>();
  await Promise.allSettled(allTickers.map(async t => {
    const p = await getPrice(t);
    priceMap.set(t, p);
  }));

  let totalValueCAD = 0;
  let totalCostCAD = 0;
  let annualDivCAD = 0;

  const accountSummaries: Array<{
    name: string;
    type: string;
    valueCAD: number;
    costCAD: number;
    gainCAD: number;
    gainPct: number;
    todayChangeCAD: number;
    holdings: Array<{
      ticker: string;
      shares: number;
      price: number | null;
      todayChangePct: number | null;
      todayChangeCAD: number | null;
      valueCAD: number;
      costCAD: number;
      gainPct: number;
      currentPct: number;
      targetPct: number | null;
      diffPct: number | null;
      annualDivCAD: number;
      divPerShare: number | null;
      yld: number | null;
    }>;
  }> = [];

  for (const portfolio of portfolios) {
    let acctValueCAD = 0;
    let acctCostCAD = 0;
    let acctTodayChangeCAD = 0;

    const holdingItems: Array<{
      ticker: string;
      shares: number;
      price: number | null;
      todayChangePct: number | null;
      todayChangeCAD: number | null;
      valueCAD: number;
      costCAD: number;
      gainPct: number;
      annualDivCAD: number;
      divPerShare: number | null;
      yld: number | null;
    }> = [];

    for (const holding of portfolio.holdings) {
      const shares = parseFloat(holding.quantity.toString());
      if (shares <= 0) continue;

      const isFx = holding.currency === "USD";
      const fx = isFx ? fxRate : 1;

      // FIFO-based average cost (reflects SELL reductions)
      const txList = holding.transactions
        .filter(t => t.action === "BUY" || t.action === "SELL")
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let remainingShares = 0;
      let totalCostBasis = 0;
      for (const tx of txList) {
        const qty = parseFloat(tx.quantity.toString());
        const price = parseFloat(tx.price.toString());
        const comm = parseFloat(tx.commission.toString());
        if (tx.action === "BUY") {
          totalCostBasis += qty * price + comm;
          remainingShares += qty;
        } else if (tx.action === "SELL") {
          if (remainingShares > 0) {
            const avgCostBefore = totalCostBasis / remainingShares;
            totalCostBasis -= qty * avgCostBefore;
            remainingShares -= qty;
          }
        }
      }
      const avgCost = remainingShares > 0 ? totalCostBasis / remainingShares : 0;
      const costBasis = avgCost * shares;
      const costCAD = costBasis * fx;

      // Live price
      const priceData = priceMap.get(holding.ticker);
      const livePrice = priceData?.price ?? null;
      const liveValue = livePrice !== null ? livePrice * shares : costBasis;
      const valueCAD = liveValue * fx;
      const gainPct = costBasis > 0 ? Math.round(((liveValue - costBasis) / costBasis) * 1000) / 10 : 0;

      // Today's change
      const todayChangePct = priceData?.changePercent ?? null;
      const todayChangeCAD = livePrice !== null ? (priceData?.change ?? 0) * shares * fx : null;

      // Dividend
      const divTxs = holding.transactions.filter(t => t.action === "DIVIDEND");
      const divPerShare = priceData?.dividendRate ?? priceData?.trailingAnnualDividendRate ?? null;
      const annualDivFromLive = divPerShare !== null ? divPerShare * shares * fx : null;
      const annualDivFromTx = divTxs.reduce((s, t) =>
        s + parseFloat(t.quantity.toString()) * parseFloat(t.price.toString()) * fx, 0);
      const annualDiv = annualDivFromLive ?? annualDivFromTx;
      const yld = priceData?.dividendYield ?? null;

      holdingItems.push({
        ticker: holding.ticker,
        shares: Math.round(shares * 100) / 100,
        price: livePrice !== null ? Math.round(livePrice * 100) / 100 : null,
        todayChangePct: todayChangePct !== null ? Math.round(todayChangePct * 100) / 100 : null,
        todayChangeCAD: todayChangeCAD !== null ? Math.round(todayChangeCAD) : null,
        valueCAD,
        costCAD,
        gainPct,
        annualDivCAD: annualDiv,
        divPerShare: divPerShare !== null ? Math.round(divPerShare * 100) / 100 : null,
        yld: yld !== null ? Math.round(yld * 10) / 10 : null,
      });

      acctValueCAD += valueCAD;
      acctCostCAD += costCAD;
      acctTodayChangeCAD += todayChangeCAD ?? 0;
      annualDivCAD += annualDiv;
    }

    totalValueCAD += acctValueCAD;
    totalCostCAD += acctCostCAD;

    const sortedHoldings = holdingItems.sort((a, b) => b.valueCAD - a.valueCAD).slice(0, 15);

    accountSummaries.push({
      name: portfolio.name,
      type: inferAccountType(portfolio.name),
      valueCAD: Math.round(acctValueCAD),
      costCAD: Math.round(acctCostCAD),
      gainCAD: Math.round(acctValueCAD - acctCostCAD),
      gainPct: acctCostCAD > 0 ? Math.round(((acctValueCAD - acctCostCAD) / acctCostCAD) * 1000) / 10 : 0,
      todayChangeCAD: Math.round(acctTodayChangeCAD),
      holdings: sortedHoldings.map(h => ({
        ...h,
        valueCAD: Math.round(h.valueCAD),
        costCAD: Math.round(h.costCAD),
        annualDivCAD: Math.round(h.annualDivCAD),
        currentPct: acctValueCAD > 0 ? Math.round((h.valueCAD / acctValueCAD) * 1000) / 10 : 0,
        targetPct: targetAlloc[h.ticker] ?? null,
        diffPct: targetAlloc[h.ticker] != null && acctValueCAD > 0
          ? Math.round(((h.valueCAD / acctValueCAD) * 100 - targetAlloc[h.ticker]) * 10) / 10
          : null,
      })),
    });
  }

  const returnPct = totalCostCAD > 0
    ? Math.round(((totalValueCAD - totalCostCAD) / totalCostCAD) * 1000) / 10
    : 0;

  // ── RULEBOOK v4.1.10 weights & Method B (no-sell) allocation ──
  // Aggregate ticker values across all accounts for rulebook calc.
  const tickerValueCAD = new Map<string, number>();
  for (const acct of accountSummaries) {
    for (const h of acct.holdings) {
      tickerValueCAD.set(h.ticker, (tickerValueCAD.get(h.ticker) ?? 0) + h.valueCAD);
    }
  }
  const rulebookWeights = computeRulebookWeights(
    Array.from(tickerValueCAD.entries()).map(([ticker, valueCAD]) => ({ ticker, valueCAD })),
  );

  // Weekly contribution → CAD for Method B preview
  let weeklyContribCAD = 0;
  if (contribPlanSetting?.value) {
    try {
      const p = JSON.parse(contribPlanSetting.value) as { frequency?: string; amount?: number; currency?: string };
      const amtCAD = (p.amount ?? 0) * (p.currency === "USD" ? fxRate : 1);
      const mult = p.frequency === "weekly" ? 1 : p.frequency === "biweekly" ? 0.5 : (12 / 52);
      weeklyContribCAD = amtCAD * mult;
    } catch { /* ignore */ }
  }

  // Weekly contribution split — Core → SGOV → IAUM (사용자 확정 순서):
  //   1) Core Method B with the FULL weekly contribution → fills SCHD/QLD shortfall first.
  //   2) §8 SGOV refill from Core leftover. Cap = user-set Settings CAD (SGOV) if present, else rulebook 50.
  //      Activates only when SGOV<8% AND no Hard Exit.
  //   3) §3 IAUM from leftover. Cap = user-set Settings CAD (IAUM) if present, else rulebook 25.
  //      Activates only when (TFSA room) AND (IAUM<5%).
  //   4) Anything still leftover = unallocated (carries to next week).
  const tfsaRoomTotal = tfsaCarryover + TFSA_ANNUAL_2026;
  const tfsaRoomRemaining = Math.max(0, tfsaRoomTotal - tfsaDepositedThisYear);
  const tfsaRoomExists = tfsaRoomRemaining > 0;

  // Core Method B: full weekly contribution → SCHD/QLD shortfall (no carve-out).
  const methodB = computeMethodBAllocation(rulebookWeights.schdCAD, rulebookWeights.qldCAD, weeklyContribCAD);
  const coreContribCAD = methodB.schdBuyCAD + methodB.qldBuyCAD;
  const finalUnallocatedCAD = methodB.unallocatedCAD;

  // Non-Core CAD: user Settings is a SEPARATE additive stream — not subtracted from weekly contribution,
  // not gated by rulebook conditions. If user hasn't set their own value, fall back to rulebook defaults
  // (still gated by §8 SGOV<8% / §3 TFSA room+IAUM<5%) — preserves prior behavior for non-configured users.
  const sgovUserCAD = nonCoreCADByTicker["SGOV"];
  const sgovUserSet = !!(sgovUserCAD && sgovUserCAD > 0);
  const sgovActiveByRulebook = !rulebookWeights.hardExit && rulebookWeights.sgovBelowTarget;
  const sgovAllocCAD = sgovUserSet
    ? sgovUserCAD!
    : (sgovActiveByRulebook ? RULEBOOK_TARGETS.SGOV_WEEKLY_REFILL_CAD : 0);
  const sgovSourceLabel = sgovUserSet
    ? "user-settings"
    : (sgovActiveByRulebook ? "rulebook-default" : "rulebook-inactive");

  const iaumUserCAD = nonCoreCADByTicker["IAUM"];
  const iaumUserSet = !!(iaumUserCAD && iaumUserCAD > 0);
  const iaumPlan = computeIaumWeeklyPlan(tfsaRoomExists, rulebookWeights.iaumTotalWeightPct);
  const iaumRuleAllowed = iaumPlan.iaumBuyCAD > 0;
  const iaumActualCAD = iaumUserSet
    ? iaumUserCAD!
    : (iaumRuleAllowed ? RULEBOOK_TARGETS.IAUM_WEEKLY_BUY_CAD : 0);
  const iaumSourceLabel = iaumUserSet
    ? "user-settings"
    : (iaumRuleAllowed ? "rulebook-default" : "rulebook-inactive");
  const iaumDeferred = false; // additive stream — never deferred by Core consumption

  const iaumApplyReason = iaumUserSet
    ? `사용자 Settings 별도 스트림 적용: $${Math.round(iaumActualCAD)} CAD/period`
    : iaumActualCAD > 0
      ? `룰북 default 적용: $${Math.round(iaumActualCAD)} CAD (TFSA room + IAUM<5%)`
      : iaumPlan.reason;

  // Total weekly outflow: Plan + Non-Core additive streams.
  const totalWeeklyOutCAD = weeklyContribCAD + sgovAllocCAD + iaumActualCAD;

  // §6.2 Hard Exit (growth bucket ≥ 38%). Surface only when triggered.
  // Replaces v4.1.8 §10 QLD emergency cap — the closest v4.1.10 equivalent that
  // unwinds QLD to 30% of core. Soft Exit / Crisis Trigger / Annual Rebal are
  // covered separately by the Rulebook Status panel and trigger summary route.
  const hardExitPlan = computeTqqqHardExitPlan({
    schdCAD:  rulebookWeights.schdCAD,
    qldCAD:   rulebookWeights.qldCAD,
    tqqqCAD:  rulebookWeights.tqqqCAD,
    sgovCAD:  rulebookWeights.sgovCAD,
    totalCAD: rulebookWeights.totalCAD,
    hardExit: rulebookWeights.hardExit,
  });

  const rulebookSummary = {
    version: "v4.1.10",
    coreCAD: Math.round(rulebookWeights.coreCAD),
    schdCAD: Math.round(rulebookWeights.schdCAD),
    qldCAD:  Math.round(rulebookWeights.qldCAD),
    sgovCAD: Math.round(rulebookWeights.sgovCAD),
    iaumCAD: Math.round(rulebookWeights.iaumCAD),
    qldCoreWeightPct:   Math.round(rulebookWeights.qldCoreWeightPct  * 10) / 10,
    schdCoreWeightPct:  Math.round(rulebookWeights.schdCoreWeightPct * 10) / 10,
    sgovTotalWeightPct: Math.round(rulebookWeights.sgovTotalWeightPct * 10) / 10,
    iaumTotalWeightPct: Math.round(rulebookWeights.iaumTotalWeightPct * 10) / 10,
    flags: {
      hardExit:        rulebookWeights.hardExit,         // growth bucket ≥ 38 → all TQQQ + QLD to 30
      softExit:        rulebookWeights.softExit,         // growth bucket ≥ 34 → half of TQQQ
      crisisT1:        rulebookWeights.crisisT1,         // core W ≤ 25
      crisisT2:        rulebookWeights.crisisT2,         // core W ≤ 20
      sgovBelowTarget: rulebookWeights.sgovBelowTarget,  // SGOV total W < 8 (refill needed)
      sgovBelowFloor:  rulebookWeights.sgovBelowFloor,   // SGOV total W < 5 (warning)
      iaumAtCap:       rulebookWeights.iaumAtCap,        // ≥ 5% of total
      caseAEligible:   rulebookWeights.caseAEligible,    // §5 Case A: W > 31
      caseBEligible:   rulebookWeights.caseBEligible,    // §5 Case B: W < 29 AND TQQQ = 0
      cycleArmable:    rulebookWeights.cycleArmable,     // §6.1 cycle re-arm gate
    },
    targets: {
      schdOfCorePct: RULEBOOK_TARGETS.SCHD_OF_CORE_PCT,
      qldOfCorePct:  RULEBOOK_TARGETS.QLD_OF_CORE_PCT,
      sgovOfTotalPct: RULEBOOK_TARGETS.SGOV_TARGET_PCT,
      iaumMaxOfTotalPct: RULEBOOK_TARGETS.IAUM_MAX_PCT,
      // Effective per-period CAD (already user-Settings-vs-rulebook-resolved).
      iaumWeeklyBuyCAD:    iaumActualCAD,
      sgovWeeklyRefillCAD: sgovAllocCAD,
      iaumWeeklyBuySource: iaumSourceLabel,   // "user-settings" / "rulebook-default" / "rulebook-inactive"
      sgovWeeklyRefillSource: sgovSourceLabel,
      iaumRulebookDefaultCAD: RULEBOOK_TARGETS.IAUM_WEEKLY_BUY_CAD,
      sgovRulebookDefaultCAD: RULEBOOK_TARGETS.SGOV_WEEKLY_REFILL_CAD,
    },
    iaumWeeklyPlan: {
      iaumRuleBuyCAD:       iaumPlan.iaumBuyCAD,    // 룰 자체가 요구하는 금액 (25 또는 0)
      iaumActualBuyCAD:     Math.round(iaumActualCAD), // 이번 주 실제 매수 (Core 충당 후 잔액에서)
      redirectedToCoreCAD:  iaumPlan.redirectedToCoreCAD,
      reason:               iaumApplyReason,
      tfsaRoomExists:       iaumPlan.tfsaRoomExists,
      iaumBelowCap:         iaumPlan.iaumBelowCap,
      account:              "TFSA",
    },
    methodBPlan: {
      weeklyContribCAD: Math.round(weeklyContribCAD),  // Plan amount → 100% goes to Core Method B
      coreContribCAD:   Math.round(coreContribCAD),    // Core 매수 합계 = SCHD + QLD
      schdBuyCAD:       Math.round(methodB.schdBuyCAD),
      qldBuyCAD:        Math.round(methodB.qldBuyCAD),
      unallocatedCAD:   Math.round(finalUnallocatedCAD),  // Core leftover (Method B 잔액)
      // Non-Core: SEPARATE/ADDITIVE streams — not subtracted from weeklyContribCAD.
      sgovReserveCAD:   Math.round(sgovAllocCAD),
      iaumBuyCAD:       Math.round(iaumActualCAD),
      sgovSource:       sgovSourceLabel,   // "user-settings" / "rulebook-default" / "rulebook-inactive"
      iaumSource:       iaumSourceLabel,
      totalWeeklyOutCAD: Math.round(totalWeeklyOutCAD),  // weekly + sgov + iaum
    },
    hardExitPlan: hardExitPlan.active ? {
      active:                true,
      tqqqSaleCAD:           Math.round(hardExitPlan.tqqqSaleCAD),
      qldSaleCAD:            Math.round(hardExitPlan.qldSaleCAD),
      sgovRefillCAD:         Math.round(hardExitPlan.sgovRefillCAD),
      schdBuyCAD:            Math.round(hardExitPlan.schdBuyCAD),
      postGrowthBucketPct:   Math.round(hardExitPlan.postGrowthBucketPct * 10) / 10,
      proceedsOrder:         "1) sell all TQQQ + QLD to 30% core, 2) SGOV refill to 8% of total, 3) remainder to SCHD",
    } : { active: false },
    constraints: [
      "§5 Method B: SCHD/QLD never sell — buy shortfall only",
      "QLD weight basis = core (QLD/(SCHD+QLD)); growth bucket = (QLD+TQQQ)/Total drives Soft/Hard exits",
      "§8 SGOV: reserve only, total-portfolio basis, weekly refill up to 50 CAD when SGOV<8% AND no Hard Exit (5% floor — only §6.1 may pierce)",
      "§3 IAUM: TFSA only, weekly 25 CAD when (TFSA room exists) AND (IAUM<5%); else redirect 25 CAD to Core Method B; never forced 5% target; never used for crisis buying",
      "§5 annual rebalance Dec 31 (±1% deadband): W>31 Case A (QLD→30) / W<29 AND TQQQ=0 Case B (SGOV→QLD, capped at SGOV 5% floor)",
      "§6.1 Crisis Trigger: core W≤25 → sell SGOV 2.5% total → buy TQQQ (T1); core W≤20 → +2.5% (T2). Cycle re-arms when TQQQ=0 AND growth bucket≥30",
      "§6.2 TQQQ Exit Ladder: growth bucket≥34 Soft (sell half TQQQ) / ≥38 Hard (sell all TQQQ + QLD→30); proceeds → SGOV 8% → SCHD",
      "Forbidden: NDX-based trigger, optimistic scenario, sell SCHD, sell SCHD to buy IAUM/SGOV, override rulebook with sentiment/news/forecast",
    ],
  };

  // Items the AI must mark "(확인 필요)" rather than guess at.
  const unverified: string[] = [];
  if (fxFallbackInUse) unverified.push("FX 환율 (라이브 조회 실패, fallback 사용 중)");
  if (allTickers.some(t => !priceMap.get(t)?.price)) unverified.push("일부 티커의 라이브 시세");
  if (tfsaRoomTotal <= 0) unverified.push("TFSA 잔여 한도 (Settings 미입력)");
  if (rrspRoom <= 0) unverified.push("RRSP 잔여 한도 (Settings 미입력)");
  if (!investorProfileSetting?.value) unverified.push("투자자 프로필 (생년/은퇴 나이/연소득)");

  let investorProfile: { birthYear?: number; age?: number; retirementAge?: number; yearsToRetirement?: number; annualIncomeCAD?: number; rrspRoomEstimate?: number; goals?: string[] } | null = null;
  if (investorProfileSetting?.value) {
    try {
      const raw = JSON.parse(investorProfileSetting.value) as { birthYear?: number; age?: number; retirementAge?: number; annualIncome?: number; goals?: string[] };
      const birthYear = raw.birthYear ?? raw.age;
      const currentAge = birthYear ? new Date().getFullYear() - birthYear : undefined;
      const retirementAge = raw.retirementAge;
      const annualIncome = raw.annualIncome;
      investorProfile = {
        birthYear,
        age: currentAge,
        retirementAge,
        yearsToRetirement: (currentAge && retirementAge) ? Math.max(0, retirementAge - currentAge) : undefined,
        annualIncomeCAD: annualIncome,
        rrspRoomEstimate: annualIncome ? Math.min(Math.round(annualIncome * 0.18), 32490) : undefined,
        goals: raw.goals,
      };
    } catch { /* ignore */ }
  }

  // Recent activity: last 90 days of BUY/SELL + all-time dividends by month
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recentTrades: { date: string; action: string; ticker: string; qty: number; price: number; currency: string }[] = [];
  const divByMonth: Record<string, number> = {};

  for (const portfolio of portfolios) {
    for (const holding of portfolio.holdings) {
      const fx = holding.currency === "USD" ? fxRate : 1;
      for (const tx of holding.transactions) {
        const d = new Date(tx.date);
        if (tx.action === "DIVIDEND") {
          const mo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const amt = parseFloat(tx.quantity.toString()) * parseFloat(tx.price.toString()) * fx;
          divByMonth[mo] = (divByMonth[mo] ?? 0) + amt;
        } else if ((tx.action === "BUY" || tx.action === "SELL") && d >= ninetyDaysAgo) {
          recentTrades.push({
            date: d.toISOString().split("T")[0],
            action: tx.action,
            ticker: holding.ticker,
            qty: Math.round(parseFloat(tx.quantity.toString()) * 100) / 100,
            price: Math.round(parseFloat(tx.price.toString()) * 100) / 100,
            currency: holding.currency,
          });
        }
      }
    }
  }

  // Last 12 months of dividends
  const recentDivMonths = Object.entries(divByMonth)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, amt]) => ({ month, amtCAD: Math.round(amt) }));

  const context = {
    date: new Date().toISOString().split("T")[0],
    currency: "CAD",
    fxRate: Math.round(fxRate * 10000) / 10000,
    fxFallbackInUse,
    unverified,
    rulebook: rulebookSummary,
    totalValueCAD: Math.round(totalValueCAD),
    totalCostCAD: Math.round(totalCostCAD),
    totalGainCAD: Math.round(totalValueCAD - totalCostCAD),
    returnPct,
    annualDivCAD: Math.round(annualDivCAD),
    monthlyDivCAD: Math.round(annualDivCAD / 12),
    accounts: accountSummaries,
    contributions: {
      tfsa: {
        carryover: Math.round(tfsaCarryover),
        annual: TFSA_ANNUAL_2026,
        totalRoom: Math.round(tfsaRoomTotal),
        depositedThisYear: Math.round(tfsaDepositedThisYear),
        remainingRoom: Math.round(tfsaRoomRemaining),
        roomExists: tfsaRoomExists,
      },
      rrsp: { room: Math.round(rrspRoom), depositedThisYear: Math.round(rrspDepositedThisYear) },
    },
    recentTrades: recentTrades.slice(-20),
    dividendHistory: recentDivMonths,
    ...(investorProfile ? { investorProfile } : {}),
    ...((() => {
      if (!contribPlanSetting?.value) return {};
      try {
        const p = JSON.parse(contribPlanSetting.value) as { frequency?: string; amount?: number; currency?: string; cashAvailableCAD?: number };
        const amountCAD = (p.amount ?? 0) * (p.currency === "USD" ? fxRate : 1);
        return {
          regularInvestment: {
            frequency: p.frequency,
            amountCAD: Math.round(amountCAD),
            cashAvailableCAD: p.cashAvailableCAD ?? null,
          },
        };
      } catch { return {}; }
    })()),
  };

  return JSON.stringify(context);
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

export async function getCachedAiResult(
  userId: string,
  cacheKey: string
): Promise<string | null> {
  const valKey = `${userId}:ai_cache:${cacheKey}`;
  const tsKey = `${userId}:ai_cache_ts:${cacheKey}`;

  const [valSetting, tsSetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: valKey } }),
    prisma.setting.findUnique({ where: { key: tsKey } }),
  ]);

  if (!valSetting?.value || !tsSetting?.value) return null;

  const cachedAt = parseInt(tsSetting.value, 10);
  if (isNaN(cachedAt) || Date.now() - cachedAt > AI_CACHE_TTL_MS) return null;

  return valSetting.value;
}

export async function saveAiResult(
  userId: string,
  cacheKey: string,
  value: string
): Promise<void> {
  const valKey = `${userId}:ai_cache:${cacheKey}`;
  const tsKey = `${userId}:ai_cache_ts:${cacheKey}`;
  const now = String(Date.now());

  await Promise.all([
    prisma.setting.upsert({
      where: { key: valKey },
      update: { value },
      create: { key: valKey, value },
    }),
    prisma.setting.upsert({
      where: { key: tsKey },
      update: { value: now },
      create: { key: tsKey, value: now },
    }),
  ]);
}

// ── Key retrieval helper ──────────────────────────────────────────────────────

export async function getOpenAiKey(userId: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({
    where: { key: `${userId}:openai_api_key` },
  });
  if (!setting?.value) return null;
  try {
    return isEncrypted(setting.value) ? decrypt(setting.value) : setting.value;
  } catch {
    return null;
  }
}

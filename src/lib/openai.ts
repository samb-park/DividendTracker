import { prisma } from "@/lib/db";
import { getPrice, getFxRate } from "@/lib/price";

const AI_MAX_CALLS_PER_DAY = 100;
const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_FX_RATE = parseFloat(process.env.DEFAULT_FX_RATE ?? "1.35");

// ── GitHub Models API call ────────────────────────────────────────────────────

export async function callOpenAI(
  _apiKey: string,
  messages: { role: string; content: string }[],
  maxTokens = 400
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");

  const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub Models API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content?.trim() ?? "";
}

// ── Portfolio context builder ─────────────────────────────────────────────────

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
    accountType: string;
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
  const [contribRoomSetting, tfsaRoomSetting, rrspRoomSetting, investorProfileSetting, targetSettings, fxSetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: `${userId}:investment_settings` } }),
    prisma.setting.findUnique({ where: { key: `${userId}:tfsa_carryover` } }),
    prisma.setting.findUnique({ where: { key: `${userId}:rrsp_limit` } }),
    prisma.setting.findUnique({ where: { key: `${userId}:investment:investor_profile` } }),
    prisma.setting.findMany({ where: { key: { startsWith: `${userId}:investment:target:` } } }),
    prisma.setting.findUnique({ where: { key: "fx_rate_usd_cad" } }),
  ]);

  // Parse contrib room
  let tfsaRoom = 0;
  let rrspRoom = 0;
  if (contribRoomSetting?.value) {
    try {
      const parsed = JSON.parse(contribRoomSetting.value) as { contribRoom?: { tfsaCarryover?: string; rrspLimit?: string } };
      tfsaRoom = parseFloat(parsed.contribRoom?.tfsaCarryover ?? "0") || 0;
      rrspRoom = parseFloat(parsed.contribRoom?.rrspLimit ?? "0") || 0;
    } catch { /* ignore */ }
  }
  if (tfsaRoomSetting?.value) tfsaRoom = parseFloat(tfsaRoomSetting.value) || tfsaRoom;
  if (rrspRoomSetting?.value) rrspRoom = parseFloat(rrspRoomSetting.value) || rrspRoom;

  // Parse target allocations: { "AAPL": 10, "VFV.TO": 20, ... }
  const targetAlloc: Record<string, number> = {};
  const targetPrefix = `${userId}:investment:target:`;
  for (const s of targetSettings) {
    const ticker = s.key.slice(targetPrefix.length);
    try { targetAlloc[ticker] = (JSON.parse(s.value) as { pct: number }).pct; } catch { /* ignore */ }
  }

  // FX rate
  const fxRateFromDB = fxSetting ? parseFloat(fxSetting.value) : null;
  let fxRate = fxRateFromDB && fxRateFromDB > 0 ? fxRateFromDB : DEFAULT_FX_RATE;
  try {
    const live = await getFxRate();
    if (!live.fallback) fxRate = live.rate;
  } catch { /* use cached */ }

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

      const buys = holding.transactions.filter(t => t.action === "BUY");
      const divTxs = holding.transactions.filter(t => t.action === "DIVIDEND");

      const totalBought = buys.reduce((s, t) => s + parseFloat(t.quantity.toString()), 0);
      const totalCost = buys.reduce((s, t) =>
        s + parseFloat(t.quantity.toString()) * parseFloat(t.price.toString()) + parseFloat(t.commission.toString()), 0);
      const avgCost = totalBought > 0 ? totalCost / totalBought : 0;
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
      type: portfolio.accountType,
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
    totalValueCAD: Math.round(totalValueCAD),
    totalCostCAD: Math.round(totalCostCAD),
    totalGainCAD: Math.round(totalValueCAD - totalCostCAD),
    returnPct,
    annualDivCAD: Math.round(annualDivCAD),
    monthlyDivCAD: Math.round(annualDivCAD / 12),
    accounts: accountSummaries,
    contributions: {
      tfsa: { room: Math.round(tfsaRoom + 7000) },
      rrsp: { room: Math.round(rrspRoom) },
    },
    recentTrades: recentTrades.slice(-20),
    dividendHistory: recentDivMonths,
    ...(investorProfile ? { investorProfile } : {}),
  };

  return JSON.stringify(context);
}

// ── Daily call limit ──────────────────────────────────────────────────────────

export async function checkAndIncrementAiCalls(
  userId: string
): Promise<{ allowed: boolean; remaining: number }> {
  const today = new Date().toISOString().split("T")[0];
  const dateKey = `${userId}:ai_calls_date`;
  const countKey = `${userId}:ai_calls_count`;

  const [dateSetting, countSetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: dateKey } }),
    prisma.setting.findUnique({ where: { key: countKey } }),
  ]);

  const storedDate = dateSetting?.value ?? "";
  const storedCount = storedDate === today ? parseInt(countSetting?.value ?? "0", 10) : 0;

  if (storedCount >= AI_MAX_CALLS_PER_DAY) {
    return { allowed: false, remaining: 0 };
  }

  const newCount = storedCount + 1;

  await Promise.all([
    prisma.setting.upsert({
      where: { key: dateKey },
      update: { value: today },
      create: { key: dateKey, value: today },
    }),
    prisma.setting.upsert({
      where: { key: countKey },
      update: { value: String(newCount) },
      create: { key: countKey, value: String(newCount) },
    }),
  ]);

  return { allowed: true, remaining: AI_MAX_CALLS_PER_DAY - newCount };
}

export async function getRemainingAiCalls(userId: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const dateKey = `${userId}:ai_calls_date`;
  const countKey = `${userId}:ai_calls_count`;

  const [dateSetting, countSetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: dateKey } }),
    prisma.setting.findUnique({ where: { key: countKey } }),
  ]);

  const storedDate = dateSetting?.value ?? "";
  const storedCount = storedDate === today ? parseInt(countSetting?.value ?? "0", 10) : 0;

  return Math.max(0, AI_MAX_CALLS_PER_DAY - storedCount);
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

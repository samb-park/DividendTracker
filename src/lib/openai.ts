import { prisma } from "@/lib/db";

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
  // Use include to get all fields (accountType may not yet be in generated Prisma client select type)
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
            select: { action: true, quantity: true, price: true, commission: true },
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
        commission: { toString(): string };
      }>;
    }>;
  }>;

  // Fetch contribution room + investor profile settings
  const [contribRoomSetting, tfsaRoomSetting, rrspRoomSetting, investorProfileSetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: `${userId}:investment_settings` } }),
    prisma.setting.findUnique({ where: { key: `${userId}:tfsa_carryover` } }),
    prisma.setting.findUnique({ where: { key: `${userId}:rrsp_limit` } }),
    prisma.setting.findUnique({ where: { key: `${userId}:investment:investor_profile` } }),
  ]);

  // Parse saved contrib room if stored in investment_settings JSON
  let tfsaRoom = 0;
  let rrspRoom = 0;
  if (contribRoomSetting?.value) {
    try {
      const parsed = JSON.parse(contribRoomSetting.value) as {
        contribRoom?: { tfsaCarryover?: string; rrspLimit?: string };
      };
      tfsaRoom = parseFloat(parsed.contribRoom?.tfsaCarryover ?? "0") || 0;
      rrspRoom = parseFloat(parsed.contribRoom?.rrspLimit ?? "0") || 0;
    } catch {
      // ignore
    }
  }
  if (tfsaRoomSetting?.value) tfsaRoom = parseFloat(tfsaRoomSetting.value) || tfsaRoom;
  if (rrspRoomSetting?.value) rrspRoom = parseFloat(rrspRoomSetting.value) || rrspRoom;

  // Try to get a recent FX rate from Settings
  const fxSetting = await prisma.setting.findUnique({ where: { key: "fx_rate_usd_cad" } });
  const fxRate = fxSetting ? parseFloat(fxSetting.value) || DEFAULT_FX_RATE : DEFAULT_FX_RATE;

  let totalValueCAD = 0;
  let totalCostCAD = 0;
  let annualDivCAD = 0;

  const accountSummaries: Array<{
    name: string;
    type: string;
    valueCAD: number;
    holdings: Array<{ ticker: string; valuePct: number; yld: number; annualDiv: number }>;
  }> = [];

  for (const portfolio of portfolios) {
    let acctValueCAD = 0;
    const holdingItems: Array<{
      ticker: string;
      valueCAD: number;
      costCAD: number;
      annualDivCAD: number;
    }> = [];

    for (const holding of portfolio.holdings) {
      const shares = parseFloat(holding.quantity.toString());
      if (shares <= 0) continue;

      const buys = holding.transactions.filter((t) => t.action === "BUY");
      const divs = holding.transactions.filter((t) => t.action === "DIVIDEND");

      const totalBought = buys.reduce((s, t) => s + parseFloat(t.quantity.toString()), 0);

      const totalCost = buys.reduce(
        (s, t) =>
          s +
          parseFloat(t.quantity.toString()) * parseFloat(t.price.toString()) +
          parseFloat(t.commission.toString()),
        0
      );
      const avgCost = totalBought > 0 ? totalCost / totalBought : 0;
      const costBasis = avgCost * shares;

      // Estimate current value using avg cost as a proxy (no live prices in context builder)
      // This keeps the context builder fast and free of external API calls
      const estimatedValue = costBasis;

      const isFx = holding.currency === "USD";
      const fx = isFx ? fxRate : 1;
      const valueCAD = estimatedValue * fx;
      const costCAD = costBasis * fx;

      // Sum all DIVIDEND transactions as annual estimate proxy
      const recentDivCAD = divs.reduce((s, t) => {
        const amount =
          parseFloat(t.quantity.toString()) * parseFloat(t.price.toString());
        return s + amount * fx;
      }, 0);

      // Annualize: use total divs as annual estimate (or 0 if none)
      const annualEstimateCAD = recentDivCAD;

      holdingItems.push({
        ticker: holding.ticker,
        valueCAD,
        costCAD,
        annualDivCAD: annualEstimateCAD,
      });

      acctValueCAD += valueCAD;
      totalCostCAD += costCAD;
      annualDivCAD += annualEstimateCAD;
    }

    totalValueCAD += acctValueCAD;

    // Top 10 holdings by value
    const topHoldings = holdingItems
      .filter((h) => h.valueCAD > 0)
      .sort((a, b) => b.valueCAD - a.valueCAD)
      .slice(0, 10);

    const holdingSummaries = topHoldings.map((h) => ({
      ticker: h.ticker,
      valuePct: acctValueCAD > 0 ? Math.round((h.valueCAD / acctValueCAD) * 1000) / 10 : 0,
      yld:
        h.valueCAD > 0
          ? Math.round((h.annualDivCAD / h.valueCAD) * 1000) / 10
          : 0,
      annualDiv: Math.round(h.annualDivCAD),
    }));

    if (acctValueCAD > 0 || topHoldings.length > 0) {
      accountSummaries.push({
        name: portfolio.name,
        type: portfolio.accountType,
        valueCAD: Math.round(acctValueCAD),
        holdings: holdingSummaries,
      });
    }
  }

  const returnPct =
    totalCostCAD > 0
      ? Math.round(((totalValueCAD - totalCostCAD) / totalCostCAD) * 1000) / 10
      : 0;

  let investorProfile: { birthYear?: number; age?: number; goals?: string[] } | null = null;
  if (investorProfileSetting?.value) {
    try {
      const raw = JSON.parse(investorProfileSetting.value) as { birthYear?: number; age?: number; goals?: string[] };
      const birthYear = raw.birthYear ?? raw.age;
      investorProfile = {
        birthYear,
        age: birthYear ? new Date().getFullYear() - birthYear : undefined,
        goals: raw.goals,
      };
    } catch { /* ignore */ }
  }

  const context = {
    date: new Date().toISOString().split("T")[0],
    currency: "CAD",
    totalValueCAD: Math.round(totalValueCAD),
    totalCostCAD: Math.round(totalCostCAD),
    returnPct,
    annualDivCAD: Math.round(annualDivCAD),
    monthlyDivCAD: Math.round(annualDivCAD / 12),
    accounts: accountSummaries,
    contributions: {
      tfsa: { room: Math.round(tfsaRoom + 7000) }, // 7000 = 2026 annual limit
      rrsp: { room: Math.round(rrspRoom) },
    },
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

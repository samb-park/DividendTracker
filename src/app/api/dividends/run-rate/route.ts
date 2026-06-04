import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPrice, getFxRate, yahooFinance } from "@/lib/price";
import { detectFrequency } from "@/lib/dividend-utils";
import { getNasdaqDividend } from "@/lib/nasdaq-dividend";
import { netFactor } from "@/lib/dividend-withholding";
import type { PositionRunRate, RunRateResponse } from "@/lib/pocket-types";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

/**
 * Forward dividend "run-rate" per held ticker, normalized to USD.
 *
 * Run-rate (not a calendar window): the CURRENT annual dividend rate projected
 * forward, derived as `amountPerShare × detectedFrequency × shares`. This is the
 * SAME annualization used by /api/dividend-income future mode, so the year figure
 * reconciles with the income chart. We never multiply an already-annual figure
 * (e.g. trailingAnnualDividendRate) by frequency.
 *
 * Per-ticker net withholding is summed across the holding's accounts (RRSP US
 * exempt vs TFSA 15%, etc.) — never one blended factor on a ticker total.
 *
 * Client divides the included sum by 365 / 52 / 12 / 1 for D / W / M / Y.
 */

type DivInfo = { annualPerShare: number; frequency: number; currency: string; confident: boolean };

/**
 * Forward annual dividend per share (native currency): latest amount × frequency.
 * `confident` is false when fewer than 2 dividend records were available — then
 * detectFrequency() falls back to a quarterly guess, so the annual figure could
 * be off by up to 4×. The client surfaces this honestly instead of hiding it.
 */
async function getForwardAnnualPerShare(ticker: string, fallbackCurrency: string): Promise<DivInfo | null> {
  // Primary: dividendhistory.org (confirmed history → frequency, latest amount)
  try {
    const nasdaq = await getNasdaqDividend(ticker);
    if (nasdaq && nasdaq.amount != null && nasdaq.history.length > 0) {
      const frequency = detectFrequency(nasdaq.history);
      if (frequency > 0) {
        return {
          annualPerShare: nasdaq.amount * frequency,
          frequency,
          currency: fallbackCurrency,
          confident: nasdaq.history.length >= 2,
        };
      }
    }
  } catch {
    /* fall through to Yahoo */
  }

  // Fallback: Yahoo Finance dividend events
  try {
    const period1 = new Date();
    period1.setMonth(period1.getMonth() - 18);
    const chart = await yahooFinance.chart(ticker, {
      period1: period1.toISOString().split("T")[0],
      interval: "1mo",
    });
    const dividendMap = chart.events?.dividends ?? {};
    const dividends = Object.values(dividendMap)
      .map((d) => {
        const item = d as { date: Date | number | string; amount: number };
        return { date: new Date(item.date).toISOString(), amount: item.amount };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    if (dividends.length > 0) {
      const frequency = detectFrequency(dividends);
      const lastDiv = dividends[dividends.length - 1];
      const currency = chart.meta?.currency ?? fallbackCurrency;
      return { annualPerShare: lastDiv.amount * frequency, frequency, currency, confident: dividends.length >= 2 };
    }
  } catch {
    /* no dividend data */
  }

  return null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const holdings = await prisma.holding.findMany({
    where: { portfolio: { userId: session.user.id } },
    include: { portfolio: true },
  });
  const active = holdings.filter((h) => (parseFloat(h.quantity?.toString() ?? "0") || 0) > 0);

  const fx = await getFxRate(); // USDCAD

  // Per-request caches keyed by ticker (dedupe multi-account holdings).
  const priceCache = new Map<string, Awaited<ReturnType<typeof getPrice>>>();
  const divCache = new Map<string, DivInfo | null>();

  // Aggregate by (accountType, ticker) so the client can filter by account
  // (e.g. RRSP-only) AND by ticker independently. Withholding is applied
  // per-position, so an RRSP US-listed position keeps net === gross.
  const byKey = new Map<string, PositionRunRate>();
  const accountTypes = new Set<string>();

  for (const h of active) {
    const ticker = h.ticker;
    const shares = parseFloat(h.quantity?.toString() ?? "0") || 0;
    const accountType = h.portfolio.accountType ?? "NON_REG";
    accountTypes.add(accountType);

    if (!priceCache.has(ticker)) priceCache.set(ticker, await getPrice(ticker));
    if (!divCache.has(ticker)) divCache.set(ticker, await getForwardAnnualPerShare(ticker, h.currency));

    const price = priceCache.get(ticker) ?? null;
    const div = divCache.get(ticker) ?? null;

    // One native currency per ticker (price/dividend are in the same listing currency).
    const nativeCurrency = price?.currency ?? div?.currency ?? h.currency;
    const toUSD = (amt: number) => (nativeCurrency === "CAD" ? amt / fx.rate : amt);

    const priceNative = price?.price ?? null;
    const marketValueUSD = priceNative != null ? toUSD(priceNative * shares) : null;

    const annualPerShareNative = div?.annualPerShare ?? 0;
    const grossAnnualNative = annualPerShareNative * shares;
    const factor = netFactor(accountType, nativeCurrency, ticker);
    const grossAnnualUSD = toUSD(grossAnnualNative);
    const netAnnualUSD = toUSD(grossAnnualNative * factor);

    const key = `${accountType}::${ticker}`;
    const existing = byKey.get(key);
    if (existing) {
      // Multiple portfolios sharing the same account type + ticker.
      existing.shares += shares;
      existing.grossAnnualUSD += grossAnnualUSD;
      existing.netAnnualUSD += netAnnualUSD;
      if (marketValueUSD != null) {
        existing.marketValueUSD = (existing.marketValueUSD ?? 0) + marketValueUSD;
      }
    } else {
      byKey.set(key, {
        accountType,
        ticker,
        name: price?.name ?? h.name ?? ticker,
        shares,
        priceUSD: priceNative != null ? toUSD(priceNative) : null,
        marketValueUSD,
        grossAnnualUSD,
        netAnnualUSD,
        frequency: div?.frequency ?? null,
        frequencyConfident: div?.confident ?? false,
        hasDividendData: div != null,
        priceUnavailable: price == null,
        currency: nativeCurrency,
      });
    }
  }

  const payload: RunRateResponse = {
    asOf: new Date().toISOString(),
    fx: { usdcad: fx.rate, fallback: fx.fallback },
    accountTypes: [...accountTypes].sort(),
    positions: [...byKey.values()].sort((a, b) => b.netAnnualUSD - a.netAnnualUSD),
  };

  return NextResponse.json(payload);
}

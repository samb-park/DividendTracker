import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPrice, getFxRate } from "@/lib/price";
import { netFactor } from "@/lib/dividend-withholding";
import {
  getForwardAnnualPerShare,
  nextFutureDate,
  nextPayFromEx,
  type DivInfo,
} from "@/lib/pocket-dividend-dates";
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

    const nextEx = div ? nextFutureDate(div.exDate, div.frequency) : null;
    const nextPay = div ? nextPayFromEx(div.exDate, div.payDate, nextEx, div.frequency) : null;

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
        nextExDate: nextEx,
        nextPayDate: nextPay,
        dateConfirmed: div?.dateUpcoming ?? false,
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

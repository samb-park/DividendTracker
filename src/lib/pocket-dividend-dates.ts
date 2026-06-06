import { detectFrequency } from "@/lib/dividend-utils";
import { getNasdaqDividend } from "@/lib/nasdaq-dividend";
import { yahooFinance } from "@/lib/price";

/**
 * Shared forward-dividend date logic, used by BOTH /api/dividends/run-rate (the
 * Upcoming list) and /api/cron/dividend-events (the same-day push alerts) so the
 * two can never compute different dates for the same ticker.
 */

export type DivInfo = {
  annualPerShare: number;
  frequency: number;
  currency: string;
  confident: boolean;
  exDate: string | null; // raw ex-date (may be in the past)
  payDate: string | null; // raw pay-date (may be in the past)
  dateUpcoming: boolean; // raw ex-date is already in the future (confirmed, not app-projected)
};

/** Roll a (possibly past) date forward by the payment interval until it is today or later. */
export function nextFutureDate(dateStr: string | null, frequency: number): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const intervalMonths = Math.max(1, Math.round(12 / (frequency || 4)));
  let guard = 0;
  while (d.getTime() < today.getTime() && guard < 64) {
    d.setUTCMonth(d.getUTCMonth() + intervalMonths);
    guard++;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Pay date for the next cycle: keep the natural (payDate − exDate) offset off the
 * rolled-forward ex-date so pay never lands before ex (rolling each independently
 * desyncs them across month boundaries).
 */
export function nextPayFromEx(
  rawEx: string | null,
  rawPay: string | null,
  nextEx: string | null,
  frequency: number
): string | null {
  if (rawEx && rawPay && nextEx) {
    const offsetDays = Math.round(
      (Date.parse(`${rawPay}T12:00:00Z`) - Date.parse(`${rawEx}T12:00:00Z`)) / 86400000
    );
    const base = new Date(`${nextEx}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + offsetDays);
    return base.toISOString().slice(0, 10);
  }
  return nextFutureDate(rawPay, frequency);
}

/**
 * Forward annual dividend per share (native currency): latest amount × frequency.
 * `confident` is false when fewer than 2 dividend records were available — then
 * detectFrequency() falls back to a quarterly guess, so the annual figure could
 * be off by up to 4×. The client surfaces this honestly instead of hiding it.
 */
export async function getForwardAnnualPerShare(
  ticker: string,
  fallbackCurrency: string
): Promise<DivInfo | null> {
  // Primary: dividendhistory.org (confirmed history → frequency, latest amount)
  try {
    const nasdaq = await getNasdaqDividend(ticker);
    if (nasdaq && nasdaq.amount != null && nasdaq.history.length > 0) {
      const frequency = detectFrequency(nasdaq.history);
      if (frequency > 0) {
        const todayStr = new Date().toISOString().slice(0, 10);
        return {
          annualPerShare: nasdaq.amount * frequency,
          frequency,
          currency: fallbackCurrency,
          confident: nasdaq.history.length >= 2,
          exDate: nasdaq.exDividendDate,
          payDate: nasdaq.paymentDate,
          // "~" only when the app had to project a date. If the source lists a
          // future row (even its own estimate), show it without "~"; only fully
          // app-projected dates (no source row → rolled forward) stay "~".
          dateUpcoming: nasdaq.exDividendDate != null && nasdaq.exDividendDate >= todayStr,
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
      const lastDate = lastDiv.date.slice(0, 10);
      const payEstimate = new Date(`${lastDate}T12:00:00Z`);
      payEstimate.setUTCDate(payEstimate.getUTCDate() + 15);
      return {
        annualPerShare: lastDiv.amount * frequency,
        frequency,
        currency,
        confident: dividends.length >= 2,
        exDate: lastDate,
        payDate: payEstimate.toISOString().slice(0, 10),
        dateUpcoming: false, // Yahoo only gives historical events → next date is always estimated
      };
    }
  } catch {
    /* no dividend data */
  }

  return null;
}

/** Today's calendar date in America/Toronto as YYYY-MM-DD (matches the alert schedule). */
export function torontoToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Per-ticker next ex/pay dates + confirmation flag (same shape run-rate surfaces).
 * `dateConfirmed` is true only when the source published a genuine future ex-date
 * (not an app-projected "~" estimate). The cron gates same-day alerts on this so it
 * never notifies on a rolled-forward day-of-month that isn't the real ex-date.
 */
export async function computeTickerDates(
  ticker: string,
  fallbackCurrency: string
): Promise<{ nextExDate: string | null; nextPayDate: string | null; dateConfirmed: boolean } | null> {
  const div = await getForwardAnnualPerShare(ticker, fallbackCurrency);
  if (!div) return null;
  const nextEx = nextFutureDate(div.exDate, div.frequency);
  const nextPay = nextPayFromEx(div.exDate, div.payDate, nextEx, div.frequency);
  return { nextExDate: nextEx, nextPayDate: nextPay, dateConfirmed: div.dateUpcoming };
}

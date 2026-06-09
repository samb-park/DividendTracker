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
  dateUpcoming: boolean; // raw ex-date is already in the future (a source-published row, not app-projected)
  sourceEstimated: boolean; // the source row itself is flagged "estimated" (not officially declared)
};

/** UTC days in a month (month is 0-based; day 0 of the next month). */
function lastDayOfMonthUTC(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Roll a (possibly past) date forward by the payment interval until it is today
 * or later.
 *
 * Month stepping clamps to the target month's last day instead of using
 * setUTCMonth, which overflows (Jan 31 + 1mo → Mar 3) — that drifted estimated
 * dates by days and could skip an imminent cycle entirely (ex 5/31 monthly →
 * 7/1, jumping over 6/30). The original day-of-month is kept as the anchor for
 * every step (5/31 → 6/30 → 7/31, not 6/30 → 7/30); a date that IS its month's
 * last day is treated as an end-of-month schedule (11/30 → 2/28 → 5/31 → 8/31).
 */
export function nextFutureDate(
  dateStr: string | null,
  frequency: number,
  now: Date = new Date()
): string | null {
  if (!dateStr) return null;
  let d = new Date(`${dateStr}T12:00:00Z`);
  if (isNaN(d.getTime())) return null;
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const intervalMonths = Math.max(1, Math.round(12 / (frequency || 4)));
  const anchorDay =
    d.getUTCDate() === lastDayOfMonthUTC(d.getUTCFullYear(), d.getUTCMonth())
      ? 31 // end-of-month schedule → always clamp to each month's last day
      : d.getUTCDate();
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth();
  let guard = 0;
  while (d.getTime() < today.getTime() && guard < 64) {
    month += intervalMonths;
    year += Math.floor(month / 12);
    month %= 12;
    d = new Date(Date.UTC(year, month, Math.min(anchorDay, lastDayOfMonthUTC(year, month)), 12));
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
          dateUpcoming: nasdaq.exDividendDate != null && nasdaq.exDividendDate >= todayStr,
          // The source marks some upcoming rows as its own ESTIMATE (not an
          // officially declared date). Surface that separately so consumers can
          // show the "~"/clock treatment and the cron can skip same-day alerts.
          sourceEstimated: nasdaq.estimated,
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
        sourceEstimated: true, // pay date is exDate+15d guess, never a declared schedule
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

/** True only when the source published a genuine future ex-date that it did NOT
 *  flag as its own estimate. App-projected (rolled-forward) and source-estimated
 *  rows are both unconfirmed. */
export function isDateConfirmed(div: Pick<DivInfo, "dateUpcoming" | "sourceEstimated">): boolean {
  return div.dateUpcoming && !div.sourceEstimated;
}

/**
 * Per-ticker next ex/pay dates + confirmation flag (same shape run-rate surfaces).
 * `dateConfirmed` is true only when the source published a genuine declared future
 * ex-date (neither an app-projected "~" estimate nor a source-flagged estimate).
 * The cron gates same-day alerts on this so it never notifies on a projected
 * day-of-month that isn't the real ex-date.
 */
export async function computeTickerDates(
  ticker: string,
  fallbackCurrency: string
): Promise<{ nextExDate: string | null; nextPayDate: string | null; dateConfirmed: boolean } | null> {
  const div = await getForwardAnnualPerShare(ticker, fallbackCurrency);
  if (!div) return null;
  const nextEx = nextFutureDate(div.exDate, div.frequency);
  const nextPay = nextPayFromEx(div.exDate, div.payDate, nextEx, div.frequency);
  return { nextExDate: nextEx, nextPayDate: nextPay, dateConfirmed: isDateConfirmed(div) };
}

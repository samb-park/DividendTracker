"use client";

import type { TickerAgg, Basis, EventFilter } from "@/lib/pocket-types";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  if (d.getUTCFullYear() !== now.getUTCFullYear()) opts.year = "2-digit";
  return new Intl.DateTimeFormat("en-US", opts).format(d);
};

const daysUntil = (iso: string): string => {
  const target = Date.parse(`${iso}T00:00:00Z`);
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((target - todayUTC) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
};

export const UPCOMING_FILTER_OPTS: { value: EventFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ex", label: "Ex" },
  { value: "pay", label: "Pay" },
];

interface EventRow {
  ticker: string;
  type: "ex" | "pay";
  date: string;
  amount: number;
  confirmed: boolean;
}

/** Tiny clock = this date isn't confirmed yet (an estimate). Monochrome, inherits
 *  the muted color of whatever it sits in (the date gutter or the legend). */
function EstClock() {
  return (
    <svg className="pk-est-ico" viewBox="0 0 16 16" width="11" height="11" aria-hidden focusable="false">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 4.6V8l2.3 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The upcoming-events list for ONE filter (a pager page) — no header/segment.
 * The All/Ex/Pay segment is a FIXED header above the pager (UpcomingView), so
 * swiping changes the active filter while the segment stays put.
 */
export function UpcomingEvents({
  tickers,
  basis,
  filter,
  loading,
}: {
  tickers: TickerAgg[];
  basis: Basis;
  filter: EventFilter;
  loading: boolean;
}) {
  const events: EventRow[] = [];
  for (const t of tickers) {
    if (!t.hasDividendData) continue;
    const amount = basis === "net" ? t.perPaymentNetUSD : t.perPaymentGrossUSD;
    if (filter !== "pay" && t.nextExDate) {
      events.push({ ticker: t.ticker, type: "ex", date: t.nextExDate, amount, confirmed: t.dateConfirmed });
    }
    if (filter !== "ex" && t.nextPayDate) {
      events.push({ ticker: t.ticker, type: "pay", date: t.nextPayDate, amount, confirmed: t.dateConfirmed });
    }
  }
  // Date order; on the same day show Ex before Pay.
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.type === "ex" ? -1 : 1));

  if (loading) return <p className="pk-note">Loading…</p>;
  if (events.length === 0) return <p className="pk-note">No upcoming dividends for the selected holdings.</p>;
  return (
    <>
      {events.some((e) => !e.confirmed) && (
        <p className="pk-note pk-est-legend">
          <EstClock /> estimated date
        </p>
      )}
      <div className="pk-picker">
        {events.map((e) => (
          <div className="pk-event-row" key={`${e.ticker}-${e.type}`}>
            <span className="pk-event-date">
              {!e.confirmed && (
                <>
                  <span className="pk-sr-only">estimated </span>
                  <span className="est" aria-hidden>
                    <EstClock />
                  </span>
                </>
              )}
              {fmtDate(e.date)}
            </span>
            <span className="pk-event-ticker">{e.ticker}</span>
            <span className="pk-event-tag" data-type={e.type}>
              {e.type === "ex" ? "EX" : "PAY"}
            </span>
            <span className="pk-event-days">{daysUntil(e.date)}</span>
            <span className="pk-event-amt">${money(e.amount)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

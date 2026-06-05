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

const FILTER_OPTS: { value: EventFilter; label: string }[] = [
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

interface Props {
  tickers: TickerAgg[];
  basis: Basis;
  filter: EventFilter;
  setFilter: (f: EventFilter) => void;
  loading: boolean;
}

export function UpcomingList({ tickers, basis, filter, setFilter, loading }: Props) {
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

  return (
    <div className="pk-settings">
      <div className="pk-upcoming-head">
        <h1 className="pk-title">Upcoming</h1>
        <div className="pk-seg" role="group" aria-label="Event filter">
          {FILTER_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="pk-seg-btn"
              data-active={filter === o.value}
              onClick={() => setFilter(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <section>
        {loading ? (
          <p className="pk-note">Loading…</p>
        ) : events.length === 0 ? (
          <p className="pk-note">No upcoming dividends for the selected holdings.</p>
        ) : (
          <div className="pk-picker">
            {events.map((e) => (
              <div className="pk-event-row" key={`${e.ticker}-${e.type}`}>
                <span className="pk-event-date">
                  {e.confirmed ? "" : <span className="est">~</span>}
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
        )}
        {!loading && events.some((e) => !e.confirmed) && (
          <p className="pk-note">~ = estimated date (no confirmed declaration yet)</p>
        )}
      </section>
    </div>
  );
}

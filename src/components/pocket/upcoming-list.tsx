"use client";

import type { TickerAgg, Basis, EventDate } from "@/lib/pocket-types";

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

const EVENT_OPTS: { value: EventDate; label: string }[] = [
  { value: "ex", label: "Ex" },
  { value: "pay", label: "Pay" },
];

interface Props {
  tickers: TickerAgg[];
  basis: Basis;
  eventDate: EventDate;
  setEventDate: (e: EventDate) => void;
  loading: boolean;
}

export function UpcomingList({ tickers, basis, eventDate, setEventDate, loading }: Props) {
  const dateOf = (t: TickerAgg) => (eventDate === "ex" ? t.nextExDate : t.nextPayDate);

  const events = tickers
    .filter((t) => t.hasDividendData && dateOf(t))
    .sort((a, b) => (dateOf(a) ?? "").localeCompare(dateOf(b) ?? ""));

  return (
    <div className="pk-settings">
      <div className="pk-topbar">
        <h1 className="pk-title">Upcoming</h1>
        <div className="pk-seg" role="group" aria-label="Event date">
          {EVENT_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="pk-seg-btn"
              data-active={eventDate === o.value}
              onClick={() => setEventDate(o.value)}
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
            {events.map((t) => {
              const iso = dateOf(t)!;
              const amt = basis === "net" ? t.perPaymentNetUSD : t.perPaymentGrossUSD;
              return (
                <div className="pk-event-row" key={t.ticker}>
                  <span className="pk-event-date">
                    {t.dateConfirmed ? "" : <span className="est">~</span>}
                    {fmtDate(iso)}
                  </span>
                  <div className="pk-picker-main">
                    <span className="pk-picker-ticker">{t.ticker}</span>
                    <span className="pk-picker-sub">{t.name}</span>
                  </div>
                  <span className="pk-picker-amt">${money(amt)}</span>
                </div>
              );
            })}
          </div>
        )}
        {!loading && events.some((t) => !t.dateConfirmed) && (
          <p className="pk-note">~ = estimated date (no confirmed schedule yet)</p>
        )}
      </section>
    </div>
  );
}

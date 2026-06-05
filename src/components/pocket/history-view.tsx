"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Basis } from "@/lib/pocket-types";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface IncomeItem {
  ticker: string;
  amount: number; // gross, native currency
  net: number; // net (actual received), native currency
  currency: string;
  accountType: string;
}
interface IncomeMonth {
  month: string; // YYYY-MM
  items: IncomeItem[];
}

interface Props {
  basis: Basis;
  fxRate: number | null; // USDCAD; CAD → USD = amount / fxRate
}

export function HistoryView({ basis, fxRate }: Props) {
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [months, setMonths] = useState<IncomeMonth[]>([]);
  const [month, setMonth] = useState<string>("all"); // "all" | "YYYY-MM"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Load the list of years that have received dividends.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dividend-income?mode=years", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { years: number[] };
        const ys = json.years ?? [];
        setYears(ys);
        setYear(ys[0] ?? null);
        if (ys.length === 0) setLoading(false);
      } catch {
        setError(true);
        setLoading(false);
      }
    })();
  }, []);

  // Load received dividends for the selected year.
  useEffect(() => {
    if (year == null) return;
    setLoading(true);
    setError(false);
    setMonth("all");
    (async () => {
      try {
        const res = await fetch(`/api/dividend-income?mode=past&year=${year}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { months: IncomeMonth[] };
        setMonths(json.months ?? []);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [year]);

  const toUSD = useCallback(
    (v: number, currency: string) => (currency === "CAD" ? v / (fxRate ?? 1.39) : v),
    [fxRate]
  );

  const monthsWithData = useMemo(() => months.filter((m) => m.items.length > 0).map((m) => m.month), [months]);

  const { rows, total } = useMemo(() => {
    const items =
      month === "all"
        ? months.flatMap((m) => m.items)
        : months.find((m) => m.month === month)?.items ?? [];
    const byTicker = new Map<string, number>();
    for (const it of items) {
      const v = basis === "net" ? it.net : it.amount;
      byTicker.set(it.ticker, (byTicker.get(it.ticker) ?? 0) + toUSD(v, it.currency));
    }
    const rows = [...byTicker.entries()]
      .map(([ticker, amt]) => ({ ticker, amt }))
      .sort((a, b) => b.amt - a.amt);
    return { rows, total: rows.reduce((s, r) => s + r.amt, 0) };
  }, [months, month, basis, toUSD]);

  const yearIdx = year != null ? years.indexOf(year) : -1;
  const canNewer = yearIdx > 0; // years are sorted descending
  const canOlder = yearIdx >= 0 && yearIdx < years.length - 1;

  return (
    <div className="pk-settings">
      <div className="pk-summary">
        <h1 className="pk-title">History</h1>
        <div className="pk-summary-cell right">
          <span className="pk-summary-label">USD</span>
          <span className="pk-summary-value">{loading ? "—" : money(total)}</span>
        </div>
      </div>

      {/* Year stepper */}
      <div className="pk-year">
        <button
          type="button"
          className="pk-year-arrow"
          onClick={() => canOlder && setYear(years[yearIdx + 1])}
          disabled={!canOlder}
          aria-label="Older year"
        >
          ‹
        </button>
        <span className="pk-year-label">{year ?? "—"}</span>
        <button
          type="button"
          className="pk-year-arrow"
          onClick={() => canNewer && setYear(years[yearIdx - 1])}
          disabled={!canNewer}
          aria-label="Newer year"
        >
          ›
        </button>
      </div>

      {/* Month filter */}
      {monthsWithData.length > 0 && (
        <div className="pk-chips">
          <button type="button" className="pk-chip" data-active={month === "all"} onClick={() => setMonth("all")}>
            Year
          </button>
          {monthsWithData.map((m) => (
            <button key={m} type="button" className="pk-chip" data-active={month === m} onClick={() => setMonth(m)}>
              {MONTH_LABELS[parseInt(m.slice(5, 7), 10) - 1]}
            </button>
          ))}
        </div>
      )}

      <section>
        {error ? (
          <p className="pk-note warn">Couldn’t load history.</p>
        ) : loading ? (
          <p className="pk-note">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="pk-note">No dividends received in this period.</p>
        ) : (
          <div className="pk-picker">
            {rows.map((r) => (
              <div className="pk-hist-row" key={r.ticker}>
                <span className="pk-event-ticker">{r.ticker}</span>
                <span className="pk-event-amt">${money(r.amt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

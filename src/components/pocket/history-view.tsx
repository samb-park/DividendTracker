"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Basis, HistoryMode } from "@/lib/pocket-types";
import { HistoryModeToggle } from "./history-mode-toggle";
import { SwipePager, type SwipePagerHandle } from "./swipe-pager";
import { PeriodStrip } from "./period-strip";
import { PageDots, setActiveDots } from "./page-dots";

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
  mode: HistoryMode;
  setMode: (m: HistoryMode) => void;
}

/** Received-dividend rows for ONE period (a pager page): aggregate by ticker, USD desc. */
function PeriodRows({
  period,
  months,
  basis,
  toUSD,
  loading,
  error,
}: {
  period: string; // "all" | "YYYY-MM"
  months: IncomeMonth[];
  basis: Basis;
  toUSD: (v: number, currency: string) => number;
  loading: boolean;
  error: boolean;
}) {
  const rows = useMemo(() => {
    const items =
      period === "all" ? months.flatMap((m) => m.items) : months.find((m) => m.month === period)?.items ?? [];
    const byTicker = new Map<string, number>();
    for (const it of items) {
      const v = basis === "net" ? it.net : it.amount;
      byTicker.set(it.ticker, (byTicker.get(it.ticker) ?? 0) + toUSD(v, it.currency));
    }
    return [...byTicker.entries()].map(([ticker, amt]) => ({ ticker, amt })).sort((a, b) => b.amt - a.amt);
  }, [period, months, basis, toUSD]);

  if (error) return <p className="pk-note warn">Couldn’t load history.</p>;
  if (loading) return <p className="pk-note">Loading…</p>;
  if (rows.length === 0) return <p className="pk-note">No dividends received in this period.</p>;
  return (
    <div className="pk-picker">
      {rows.map((r) => (
        <div className="pk-hist-row" key={r.ticker}>
          <span className="pk-event-ticker">{r.ticker}</span>
          <span className="pk-event-amt">${money(r.amt)}</span>
        </div>
      ))}
    </div>
  );
}

export function HistoryView({ basis, fxRate, mode, setMode }: Props) {
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [months, setMonths] = useState<IncomeMonth[]>([]);
  const [month, setMonth] = useState<string>("all"); // "all" | "YYYY-MM"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pagerRef = useRef<SwipePagerHandle>(null);
  const periodRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);

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

  // Load received dividends for the selected year. Resets the period to "Year" and
  // snaps the pager back to index 0 (unconditional — even between equal-month years).
  useEffect(() => {
    if (year == null) return;
    setLoading(true);
    setError(false);
    setMonth("all");
    pagerRef.current?.scrollToIndex(0);
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
  const periodSeq = useMemo(() => ["all", ...monthsWithData], [monthsWithData]);
  const periodIdx = Math.max(0, periodSeq.indexOf(month));
  const periodLabels = useMemo(
    () => periodSeq.map((p) => (p === "all" ? "Year" : MONTH_LABELS[parseInt(p.slice(5, 7), 10) - 1])),
    [periodSeq]
  );

  // Header USD total reflects the CURRENT period.
  const total = useMemo(() => {
    const items =
      month === "all" ? months.flatMap((m) => m.items) : months.find((m) => m.month === month)?.items ?? [];
    return items.reduce((s, it) => s + toUSD(basis === "net" ? it.net : it.amount, it.currency), 0);
  }, [months, month, basis, toUSD]);

  const yearIdx = year != null ? years.indexOf(year) : -1;
  const canNewer = yearIdx > 0; // years are sorted descending
  const canOlder = yearIdx >= 0 && yearIdx < years.length - 1;

  return (
    <div className="pk-history">
      {/* Page dots float above the tab bar (fixed) — mark the swipeable periods (Year ↔ each month). */}
      <PageDots
        ref={dotsRef}
        count={periodSeq.length}
        activeIndex={periodIdx}
        onSelect={(i) => pagerRef.current?.scrollToIndex(i)}
        ariaLabel="Periods"
        itemLabel={(i) => periodLabels[i]}
      />
      <div className="pk-summary">
        <h1 className="pk-title">History</h1>
        <div className="pk-summary-cell right">
          <span className="pk-summary-label">USD</span>
          <span className="pk-summary-value">{loading ? "—" : money(total)}</span>
        </div>
      </div>

      <HistoryModeToggle mode={mode} setMode={setMode} />

      {/* Year stepper (arrows = year) + current period label (updates on swipe). */}
      <div className="pk-year-row">
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
        <PeriodStrip labels={periodLabels} ref={periodRef} />
      </div>

      {/* Period pager: swipe Year ↔ months; only the current period's rows show. */}
      <div className="pk-paged-region">
        <SwipePager
          ref={pagerRef}
          items={periodSeq}
          activeIndex={periodIdx}
          pageClassName="pk-paged-page"
          dragSwipe
          onProgress={(f) => {
            periodRef.current?.style.setProperty("--period-progress", String(f));
            setActiveDots(dotsRef.current, Math.round(f));
          }}
          onSettle={(i) => {
            const p = periodSeq[i];
            if (p !== month) setMonth(p);
          }}
          renderPage={(period) => (
            <PeriodRows period={period} months={months} basis={basis} toUSD={toUSD} loading={loading} error={error} />
          )}
        />
      </div>
    </div>
  );
}

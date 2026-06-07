"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Basis, HistoryMode } from "@/lib/pocket-types";
import { inAccountScope } from "@/lib/pocket-types";
import { HistoryModeToggle } from "./history-mode-toggle";
import { PortfolioPickerButton } from "./portfolio-picker-button";
import { PeriodPickerButton } from "./period-picker-button";
import { PeriodPicker } from "./period-picker";
import { SwipePager, type SwipePagerHandle } from "./swipe-pager";
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
  activeAccounts: string[]; // portfolio account scope ([] = all)
  portfolioName: string;
  onOpenPicker: () => void;
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

export function HistoryView({ basis, fxRate, mode, setMode, activeAccounts, portfolioName, onOpenPicker }: Props) {
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [months, setMonths] = useState<IncomeMonth[]>([]);
  const [month, setMonth] = useState<string>("all"); // "all" | "YYYY-MM"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const pagerRef = useRef<SwipePagerHandle>(null);
  const periodLabelRef = useRef<HTMLSpanElement>(null);
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

  // Account-scope filter (received dividends carry accountType): keep only the
  // selected portfolio's accounts. Empty scope = all. Drives rows, total, and periods.
  const scopedMonths = useMemo(
    () => months.map((m) => ({ ...m, items: m.items.filter((it) => inAccountScope(it.accountType, activeAccounts)) })),
    [months, activeAccounts]
  );
  const monthsWithData = useMemo(() => scopedMonths.filter((m) => m.items.length > 0).map((m) => m.month), [scopedMonths]);
  const periodSeq = useMemo(() => ["all", ...monthsWithData], [monthsWithData]);
  const periodIdx = Math.max(0, periodSeq.indexOf(month));
  // Keep the period pager aligned to periodIdx: when an account filter changes the
  // period set, a now-invalid `month` collapses periodIdx → scroll there; onSettle
  // reconciles `month` (→ "all"). Idempotent for a normal swipe-settle (no-op).
  useEffect(() => { pagerRef.current?.scrollToIndex(periodIdx); }, [periodIdx]);
  const periodLabels = useMemo(
    () => periodSeq.map((p) => (p === "all" ? "Year" : MONTH_LABELS[parseInt(p.slice(5, 7), 10) - 1])),
    [periodSeq]
  );

  // Header USD total reflects the CURRENT period.
  const total = useMemo(() => {
    const items =
      month === "all" ? scopedMonths.flatMap((m) => m.items) : scopedMonths.find((m) => m.month === month)?.items ?? [];
    return items.reduce((s, it) => s + toUSD(basis === "net" ? it.net : it.amount, it.currency), 0);
  }, [scopedMonths, month, basis, toUSD]);

  return (
    <div className="pk-history">
      <div className="pk-summary">
        <PortfolioPickerButton name={portfolioName} onOpen={onOpenPicker} />
        <div className="pk-summary-cell right">
          <span className="pk-summary-label">USD</span>
          <span className="pk-summary-value">{loading ? "—" : money(total)}</span>
        </div>
      </div>

      <HistoryModeToggle mode={mode} setMode={setMode} />

      {/* Tappable "year · period ▾" → PeriodPicker sheet. The period label
          live-updates during a swipe (the year doesn't change on swipe). */}
      <div className="pk-year-row">
        <PeriodPickerButton
          ref={periodLabelRef}
          year={year}
          periodLabel={periodLabels[periodIdx]}
          onOpen={() => setPeriodOpen(true)}
        />
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
            const lbl = periodLabels[Math.round(f)];
            if (periodLabelRef.current && lbl != null) periodLabelRef.current.textContent = lbl;
            setActiveDots(dotsRef.current, Math.round(f));
          }}
          onSettle={(i) => {
            const p = periodSeq[i];
            if (p !== month) setMonth(p);
          }}
          renderPage={(period) => (
            <PeriodRows period={period} months={scopedMonths} basis={basis} toUSD={toUSD} loading={loading} error={error} />
          )}
        />
      </div>
      {/* Page dots DOCKED below the list, just above the tab bar — mark the swipeable periods (Year ↔ each month). */}
      <PageDots
        ref={dotsRef}
        count={periodSeq.length}
        activeIndex={periodIdx}
        onSelect={(i) => pagerRef.current?.scrollToIndex(i)}
        ariaLabel="Periods"
        itemLabel={(i) => periodLabels[i]}
      />

      {periodOpen && (
        <PeriodPicker
          year={year}
          years={years}
          onYear={setYear}
          periods={periodSeq.map((k, i) => ({ key: k, label: periodLabels[i] }))}
          activeKey={month}
          loading={loading}
          onPeriod={setMonth}
          onClose={() => setPeriodOpen(false)}
        />
      )}
    </div>
  );
}

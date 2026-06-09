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

// M7: module-level stale-while-revalidate cache. Re-entering the tab shows the
// last response instantly (no loading flash / layout shift) while a background
// refetch reconciles. Lives for the page session; keys: "years" | "past:<year>".
const incomeCache = new Map<string, number[] | IncomeMonth[]>();

/** Shared row-shaped loading skeleton for the Activity lists (M7). */
export function SkeletonRows() {
  return (
    <div className="pk-picker pk-card" aria-hidden>
      {[72, 56, 64, 48, 60].map((w, i) => (
        <div className="pk-skel-row" key={i}>
          <span className="pk-skel-bar" style={{ width: w }} />
          <span className="pk-skel-bar right" />
        </div>
      ))}
    </div>
  );
}

interface Props {
  basis: Basis;
  fxRate: number | null; // USDCAD; CAD → USD = amount / fxRate
  fxFallback: boolean; // the server rate is a fallback — flag converted figures (L1)
  groupScope: boolean; // ticker-group portfolio active — this mode is account-scoped (L2)
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
  if (loading) return <SkeletonRows />;
  if (rows.length === 0) return <p className="pk-note">No dividends received in this period.</p>;
  return (
    <div className="pk-picker pk-card">
      {rows.map((r) => (
        <div className="pk-hist-row" key={r.ticker}>
          <span className="pk-event-ticker">{r.ticker}</span>
          <span className="pk-event-amt">${money(r.amt)}</span>
        </div>
      ))}
    </div>
  );
}

export function HistoryView({ basis, fxRate, fxFallback, groupScope, mode, setMode, activeAccounts, portfolioName, onOpenPicker }: Props) {
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

  // Load the list of years that have received dividends. Stale-while-revalidate
  // (M7): a cached list applies instantly; the network result reconciles after.
  useEffect(() => {
    let cancelled = false;
    const apply = (ys: number[]) => {
      setYears(ys);
      // keep the user's pick if it's still valid (a background refresh must not yank it)
      setYear((y) => (y != null && ys.includes(y) ? y : ys[0] ?? null));
      if (ys.length === 0) setLoading(false);
    };
    const cached = incomeCache.get("years") as number[] | undefined;
    if (cached) apply(cached);
    (async () => {
      try {
        const res = await fetch("/api/dividend-income?mode=years", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { years: number[] };
        if (cancelled) return;
        const ys = json.years ?? [];
        incomeCache.set("years", ys);
        apply(ys);
      } catch {
        if (!cancelled && !cached) {
          setError(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load received dividends for the selected year. Resets the period to "Year" and
  // snaps the pager back to index 0 (unconditional — even between equal-month years).
  // Stale-while-revalidate (M7): a cached year shows instantly, then refreshes.
  useEffect(() => {
    if (year == null) return;
    const key = `past:${year}`;
    const cached = incomeCache.get(key) as IncomeMonth[] | undefined;
    setError(false);
    setMonth("all");
    pagerRef.current?.scrollToIndex(0);
    if (cached) {
      setMonths(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/dividend-income?mode=past&year=${year}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { months: IncomeMonth[] };
        if (cancelled) return;
        const ms = json.months ?? [];
        incomeCache.set(key, ms);
        setMonths(ms);
      } catch {
        if (!cancelled && !cached) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  // L1: fallback matches the server's DEFAULT_FX_RATE (1.35) — with the rate
  // coming from the run-rate response this only triggers when data is absent.
  const toUSD = useCallback(
    (v: number, currency: string) => (currency === "CAD" ? v / (fxRate ?? 1.35) : v),
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
        {/* L2: this mode filters by ACCOUNT only — say so when a ticker group is active. */}
        {groupScope && <span className="pk-scope-note">All tickers · account scope</span>}
        {/* L1: converted figures rest on a default FX rate — tiny inline warning. */}
        {(fxFallback || fxRate == null) && <span className="pk-scope-note warn">default FX</span>}
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

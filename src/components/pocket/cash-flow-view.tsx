"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryMode, CashFlowRow } from "@/lib/pocket-types";
import { inAccountScope } from "@/lib/pocket-types";
import { HistoryModeToggle } from "./history-mode-toggle";
import { PortfolioPickerButton } from "./portfolio-picker-button";
import { PeriodPickerButton } from "./period-picker-button";
import { PeriodPicker } from "./period-picker";
import { SwipePager, type SwipePagerHandle } from "./swipe-pager";
import { PageDots, setActiveDots } from "./page-dots";
import { SkeletonRows } from "./history-view";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const cad = (n: number) => `C$${money(n)}`;

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// M7: module-level stale-while-revalidate cache, keyed by year.
const cashCache = new Map<number, { items: CashFlowRow[]; years: number[] }>();

interface Props {
  fxRate: number | null; // USDCAD; USD → CAD = amount * fxRate
  fxFallback: boolean; // the server rate is a fallback — flag converted figures (L1)
  groupScope: boolean; // ticker-group portfolio active — this mode is account-scoped (L2)
  mode: HistoryMode;
  setMode: (m: HistoryMode) => void;
  activeAccounts: string[]; // portfolio account scope ([] = all)
  portfolioName: string;
  onOpenPicker: () => void;
}

/** Per-account CONTRIBUTIONS (gross deposits, "불입") for ONE period (a pager page),
 *  converted to CAD and sorted desc. Gross — not net — because that's the literal
 *  "how much did I put in" and the number that drives TFSA/RRSP contribution room
 *  (a withdrawal doesn't free room until the next year). Withdrawal-only accounts
 *  don't appear. (The desktop /more surface has the full deposited/withdrawn/net.) */
function AccountRows({
  period,
  items,
  toCAD,
  loading,
  error,
}: {
  period: string; // "all" | "YYYY-MM"
  items: CashFlowRow[];
  toCAD: (v: number, currency: string) => number;
  loading: boolean;
  error: boolean;
}) {
  const rows = useMemo(() => {
    const deposits = items.filter(
      (t) => t.action === "DEPOSIT" && (period === "all" || t.date.slice(0, 7) === period)
    );
    const byAcct = new Map<string, { id: string; name: string; contributed: number }>();
    for (const it of deposits) {
      const v = toCAD(it.amount, it.currency);
      const e = byAcct.get(it.portfolioId);
      if (e) e.contributed += v;
      else byAcct.set(it.portfolioId, { id: it.portfolioId, name: it.portfolioName, contributed: v });
    }
    return [...byAcct.values()].sort((a, b) => b.contributed - a.contributed);
  }, [items, period, toCAD]);

  if (error) return <p className="pk-note warn">Couldn’t load cash flow.</p>;
  if (loading) return <SkeletonRows />;
  if (rows.length === 0) return <p className="pk-note">No contributions in this period.</p>;
  return (
    <div className="pk-picker">
      {rows.map((r) => (
        <div className="pk-hist-row" key={r.id}>
          <span className="pk-event-ticker pk-cf-acct">{r.name}</span>
          <span className="pk-event-amt">{cad(r.contributed)}</span>
        </div>
      ))}
    </div>
  );
}

export function CashFlowView({ fxRate, fxFallback, groupScope, mode, setMode, activeAccounts, portfolioName, onOpenPicker }: Props) {
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [years, setYears] = useState<number[]>([]);
  const [items, setItems] = useState<CashFlowRow[]>([]);
  const [month, setMonth] = useState<string>("all"); // "all" | "YYYY-MM"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const pagerRef = useRef<SwipePagerHandle>(null);
  const periodLabelRef = useRef<HTMLSpanElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);

  // One fetch per year returns BOTH the year's deposits/withdrawals AND the full
  // list of years that have data (the API always includes the current year).
  // Resets the period to "Year" and snaps the pager to index 0 on every year change.
  // Stale-while-revalidate (M7): a cached year shows instantly on re-entry; the
  // network result reconciles in the background.
  useEffect(() => {
    const cached = cashCache.get(year);
    setError(false);
    setMonth("all");
    pagerRef.current?.scrollToIndex(0);
    if (cached) {
      setItems(cached.items);
      if (cached.years.length) setYears(cached.years);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cash-transactions?year=${year}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { items: CashFlowRow[]; years: number[] };
        if (cancelled) return;
        cashCache.set(year, { items: json.items ?? [], years: json.years ?? [] });
        setItems(json.items ?? []);
        if (json.years?.length) setYears(json.years);
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
  const toCAD = useCallback(
    (v: number, currency: string) => (currency === "USD" ? v * (fxRate ?? 1.35) : v),
    [fxRate]
  );

  // Account-scope filter (empty = all): only the selected portfolio's accounts.
  const scopedItems = useMemo(
    () => items.filter((t) => inAccountScope(t.portfolioAccountType, activeAccounts)),
    [items, activeAccounts]
  );

  const monthsWithData = useMemo(
    () => [...new Set(scopedItems.filter((t) => t.action === "DEPOSIT").map((t) => t.date.slice(0, 7)))].sort(),
    [scopedItems]
  );
  const periodSeq = useMemo(() => ["all", ...monthsWithData], [monthsWithData]);
  const periodIdx = Math.max(0, periodSeq.indexOf(month));
  // Keep the period pager aligned to periodIdx when an account filter changes the
  // period set (onSettle reconciles a now-invalid `month` → "all"). Idempotent on swipe.
  useEffect(() => { pagerRef.current?.scrollToIndex(periodIdx); }, [periodIdx]);
  const periodLabels = useMemo(
    () => periodSeq.map((p) => (p === "all" ? "Year" : MONTH_LABELS[parseInt(p.slice(5, 7), 10) - 1])),
    [periodSeq]
  );

  // Header total = total CONTRIBUTED (gross deposits) for the current period (CAD).
  const total = useMemo(() => {
    return scopedItems
      .filter((t) => t.action === "DEPOSIT" && (month === "all" || t.date.slice(0, 7) === month))
      .reduce((s, t) => s + toCAD(t.amount, t.currency), 0);
  }, [scopedItems, month, toCAD]);

  return (
    <div className="pk-history">
      <div className="pk-summary">
        <PortfolioPickerButton name={portfolioName} onOpen={onOpenPicker} />
        <div className="pk-summary-cell right">
          <span className="pk-summary-label">CAD</span>
          <span className="pk-summary-value">{loading ? "—" : cad(total)}</span>
        </div>
      </div>

      <HistoryModeToggle mode={mode} setMode={setMode} />

      {/* Tappable "year · period ▾" → PeriodPicker sheet (period label live-updates
          on swipe; year only changes via the picker). */}
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

      {/* Period pager: swipe Year ↔ months; per-account net contributions show. */}
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
            <AccountRows period={period} items={scopedItems} toCAD={toCAD} loading={loading} error={error} />
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

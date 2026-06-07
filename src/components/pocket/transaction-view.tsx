"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryMode, TxnFilter, TransactionRow } from "@/lib/pocket-types";
import { inAccountScope } from "@/lib/pocket-types";
import { HistoryModeToggle } from "./history-mode-toggle";
import { PortfolioPickerButton } from "./portfolio-picker-button";
import { PeriodPickerButton } from "./period-picker-button";
import { PeriodPicker } from "./period-picker";
import { SwipePager, type SwipePagerHandle } from "./swipe-pager";
import { AnimatedSegment } from "./animated-segment";
import { PageDots, setActiveDots } from "./page-dots";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const qtyFmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n);

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  if (d.getUTCFullYear() !== now.getUTCFullYear()) opts.year = "2-digit";
  return new Intl.DateTimeFormat("en-US", opts).format(d);
};

const FILTER_OPTS: { value: TxnFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "div", label: "Div" },
];
const FILTER_ACTION: Record<Exclude<TxnFilter, "all">, TransactionRow["action"]> = {
  buy: "BUY",
  sell: "SELL",
  div: "DIVIDEND",
};
const BADGE: Record<TransactionRow["action"], { label: string; type: string }> = {
  BUY: { label: "BUY", type: "buy" },
  SELL: { label: "SELL", type: "sell" },
  DIVIDEND: { label: "DIV", type: "div" },
};

interface Props {
  fxRate: number | null;
  mode: HistoryMode;
  setMode: (m: HistoryMode) => void;
  activeAccounts: string[]; // portfolio account scope ([] = all)
  portfolioName: string;
  onOpenPicker: () => void;
}

/** Transaction rows for ONE period (a pager page), filtered by the action filter. */
function TxnPeriodRows({
  period,
  yearTxns,
  filter,
  toUSD,
  loading,
  error,
}: {
  period: string; // "all" | "YYYY-MM"
  yearTxns: TransactionRow[];
  filter: TxnFilter;
  toUSD: (v: number, currency: string) => number;
  loading: boolean;
  error: boolean;
}) {
  const rows = useMemo(
    () =>
      yearTxns
        .filter((t) => period === "all" || t.date.slice(0, 7) === period)
        .filter((t) => filter === "all" || t.action === FILTER_ACTION[filter as Exclude<TxnFilter, "all">]),
    [yearTxns, period, filter]
  );

  if (error) return <p className="pk-note warn">Couldn’t load transactions.</p>;
  if (loading) return <p className="pk-note">Loading…</p>;
  if (rows.length === 0) return <p className="pk-note">No transactions in this period.</p>;
  return (
    <div className="pk-picker">
      {rows.map((t) => (
        <div className="pk-txn-row" key={t.id}>
          <span className="pk-event-date">{fmtDate(t.date)}</span>
          <span className="pk-event-ticker">{t.ticker}</span>
          <span className="pk-event-tag" data-type={BADGE[t.action].type}>
            {BADGE[t.action].label}
          </span>
          <span className="pk-event-days">{t.action === "DIVIDEND" ? "" : `${qtyFmt(t.quantity)} sh`}</span>
          <span className="pk-event-amt">${money(toUSD(t.total, t.currency))}</span>
        </div>
      ))}
    </div>
  );
}

export function TransactionView({ fxRate, mode, setMode, activeAccounts, portfolioName, onOpenPicker }: Props) {
  const [txns, setTxns] = useState<TransactionRow[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<string>("all"); // "all" | "YYYY-MM"
  const [filter, setFilter] = useState<TxnFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const pagerRef = useRef<SwipePagerHandle>(null);
  const periodLabelRef = useRef<HTMLSpanElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/transactions/calendar", { cache: "no-store" });
        if (!res.ok) throw new Error();
        setTxns((await res.json()) as TransactionRow[]);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toUSD = useCallback(
    (v: number, currency: string) => (currency === "CAD" ? v / (fxRate ?? 1.39) : v),
    [fxRate]
  );

  // Account-scope filter (empty = all) — drives years, periods, rows, and total.
  const scopedTxns = useMemo(
    () => txns.filter((t) => inAccountScope(t.accountType, activeAccounts)),
    [txns, activeAccounts]
  );
  // Years derived from the (scoped) transactions themselves (includes buy/sell-only years).
  const years = useMemo(
    () => [...new Set(scopedTxns.map((t) => parseInt(t.date.slice(0, 4), 10)))].sort((a, b) => b - a),
    [scopedTxns]
  );
  useEffect(() => {
    if (year == null && years.length) setYear(years[0]);
  }, [years, year]);
  // Year change resets the period to "Year" and snaps the pager to index 0
  // (monthsWithData is synchronous here, so length can change this same render).
  useEffect(() => {
    setMonth("all");
    pagerRef.current?.scrollToIndex(0);
  }, [year]);

  const yearTxns = useMemo(
    () => (year == null ? [] : scopedTxns.filter((t) => t.date.slice(0, 4) === String(year))),
    [scopedTxns, year]
  );
  const monthsWithData = useMemo(
    () => [...new Set(yearTxns.map((t) => t.date.slice(0, 7)))].sort(),
    [yearTxns]
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

  // Header USD total = current period × current action filter.
  const total = useMemo(() => {
    return yearTxns
      .filter((t) => month === "all" || t.date.slice(0, 7) === month)
      .filter((t) => filter === "all" || t.action === FILTER_ACTION[filter as Exclude<TxnFilter, "all">])
      .reduce((s, t) => s + toUSD(t.total, t.currency), 0);
  }, [yearTxns, month, filter, toUSD]);

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

      {/* Action filter — directly below the mode toggle. */}
      <AnimatedSegment options={FILTER_OPTS} value={filter} onChange={setFilter} ariaLabel="Transaction type" />

      {/* Tappable "year · period ▾" → PeriodPicker sheet (period label live-updates
          on swipe; year only changes via the picker). */}
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
            <TxnPeriodRows
              period={period}
              yearTxns={yearTxns}
              filter={filter}
              toUSD={toUSD}
              loading={loading}
              error={error}
            />
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

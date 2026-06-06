"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryMode, TxnFilter, TransactionRow } from "@/lib/pocket-types";
import { HistoryModeToggle } from "./history-mode-toggle";
import { SwipePager, type SwipePagerHandle } from "./swipe-pager";

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
          <span className="pk-event-days">{t.action === "DIVIDEND" ? "" : `× ${qtyFmt(t.quantity)}`}</span>
          <span className="pk-event-amt">${money(toUSD(t.total, t.currency))}</span>
        </div>
      ))}
    </div>
  );
}

export function TransactionView({ fxRate, mode, setMode }: Props) {
  const [txns, setTxns] = useState<TransactionRow[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<string>("all"); // "all" | "YYYY-MM"
  const [filter, setFilter] = useState<TxnFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pagerRef = useRef<SwipePagerHandle>(null);

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

  // Years derived from the transactions themselves (includes buy/sell-only years).
  const years = useMemo(
    () => [...new Set(txns.map((t) => parseInt(t.date.slice(0, 4), 10)))].sort((a, b) => b - a),
    [txns]
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
    () => (year == null ? [] : txns.filter((t) => t.date.slice(0, 4) === String(year))),
    [txns, year]
  );
  const monthsWithData = useMemo(
    () => [...new Set(yearTxns.map((t) => t.date.slice(0, 7)))].sort(),
    [yearTxns]
  );
  const periodSeq = useMemo(() => ["all", ...monthsWithData], [monthsWithData]);
  const periodIdx = Math.max(0, periodSeq.indexOf(month));
  const periodLabel = month === "all" ? "Year" : MONTH_LABELS[parseInt(month.slice(5, 7), 10) - 1];

  // Header USD total = current period × current action filter.
  const total = useMemo(() => {
    return yearTxns
      .filter((t) => month === "all" || t.date.slice(0, 7) === month)
      .filter((t) => filter === "all" || t.action === FILTER_ACTION[filter as Exclude<TxnFilter, "all">])
      .reduce((s, t) => s + toUSD(t.total, t.currency), 0);
  }, [yearTxns, month, filter, toUSD]);

  const yearIdx = year != null ? years.indexOf(year) : -1;
  const canNewer = yearIdx > 0;
  const canOlder = yearIdx >= 0 && yearIdx < years.length - 1;

  return (
    <div className="pk-history">
      <div className="pk-summary">
        <h1 className="pk-title">History</h1>
        <div className="pk-summary-cell right">
          <span className="pk-summary-label">USD</span>
          <span className="pk-summary-value">{loading ? "—" : money(total)}</span>
        </div>
      </div>

      <HistoryModeToggle mode={mode} setMode={setMode} />

      {/* Action filter — directly below the mode toggle. */}
      <div className="pk-seg" role="group" aria-label="Transaction type">
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

      {/* Year stepper + current period label (updates on swipe). */}
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
        <span className="pk-history-label">{periodLabel}</span>
      </div>

      {/* Period pager: swipe Year ↔ months; only the current period's rows show. */}
      <div className="pk-paged-region">
        <SwipePager
          ref={pagerRef}
          items={periodSeq}
          activeIndex={periodIdx}
          pageClassName="pk-paged-page"
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
    </div>
  );
}

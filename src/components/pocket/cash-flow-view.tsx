"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryMode, CashFlowRow } from "@/lib/pocket-types";
import { HistoryModeToggle } from "./history-mode-toggle";
import { SwipePager, type SwipePagerHandle } from "./swipe-pager";
import { PeriodStrip } from "./period-strip";
import { PageDots, setActiveDots } from "./page-dots";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const cad = (n: number) => `C$${money(n)}`;

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Props {
  fxRate: number | null; // USDCAD; USD → CAD = amount * fxRate
  mode: HistoryMode;
  setMode: (m: HistoryMode) => void;
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
  if (loading) return <p className="pk-note">Loading…</p>;
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

export function CashFlowView({ fxRate, mode, setMode }: Props) {
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [years, setYears] = useState<number[]>([]);
  const [items, setItems] = useState<CashFlowRow[]>([]);
  const [month, setMonth] = useState<string>("all"); // "all" | "YYYY-MM"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pagerRef = useRef<SwipePagerHandle>(null);
  const periodRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);

  // One fetch per year returns BOTH the year's deposits/withdrawals AND the full
  // list of years that have data (the API always includes the current year).
  // Resets the period to "Year" and snaps the pager to index 0 on every year change.
  useEffect(() => {
    setLoading(true);
    setError(false);
    setMonth("all");
    pagerRef.current?.scrollToIndex(0);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cash-transactions?year=${year}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { items: CashFlowRow[]; years: number[] };
        if (cancelled) return;
        setItems(json.items ?? []);
        if (json.years?.length) setYears(json.years);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const toCAD = useCallback(
    (v: number, currency: string) => (currency === "USD" ? v * (fxRate ?? 1.39) : v),
    [fxRate]
  );

  const monthsWithData = useMemo(
    () => [...new Set(items.filter((t) => t.action === "DEPOSIT").map((t) => t.date.slice(0, 7)))].sort(),
    [items]
  );
  const periodSeq = useMemo(() => ["all", ...monthsWithData], [monthsWithData]);
  const periodIdx = Math.max(0, periodSeq.indexOf(month));
  const periodLabels = useMemo(
    () => periodSeq.map((p) => (p === "all" ? "Year" : MONTH_LABELS[parseInt(p.slice(5, 7), 10) - 1])),
    [periodSeq]
  );

  // Header total = total CONTRIBUTED (gross deposits) for the current period (CAD).
  const total = useMemo(() => {
    return items
      .filter((t) => t.action === "DEPOSIT" && (month === "all" || t.date.slice(0, 7) === month))
      .reduce((s, t) => s + toCAD(t.amount, t.currency), 0);
  }, [items, month, toCAD]);

  const yearIdx = years.indexOf(year);
  const canNewer = yearIdx > 0; // years are sorted descending
  const canOlder = yearIdx >= 0 && yearIdx < years.length - 1;

  return (
    <div className="pk-history">
      <div className="pk-summary">
        <h1 className="pk-title">History</h1>
        <div className="pk-summary-cell right">
          <span className="pk-summary-label">CAD</span>
          <span className="pk-summary-value">{loading ? "—" : cad(total)}</span>
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
          <span className="pk-year-label">{year}</span>
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

      {/* Period pager: swipe Year ↔ months; per-account net contributions show. */}
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
            <AccountRows period={period} items={items} toCAD={toCAD} loading={loading} error={error} />
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
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HistoryMode, TxnFilter, TransactionRow } from "@/lib/pocket-types";
import { HistoryModeToggle } from "./history-mode-toggle";

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

export function TransactionView({ fxRate, mode, setMode }: Props) {
  const [txns, setTxns] = useState<TransactionRow[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<string>("all"); // "all" | "YYYY-MM"
  const [filter, setFilter] = useState<TxnFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
  useEffect(() => {
    setMonth("all");
  }, [year]);

  const yearTxns = useMemo(
    () => (year == null ? [] : txns.filter((t) => t.date.slice(0, 4) === String(year))),
    [txns, year]
  );
  const monthsWithData = useMemo(
    () => [...new Set(yearTxns.map((t) => t.date.slice(0, 7)))].sort(),
    [yearTxns]
  );

  const { rows, total } = useMemo(() => {
    const rows = yearTxns
      .filter((t) => month === "all" || t.date.slice(0, 7) === month)
      .filter((t) => filter === "all" || t.action === FILTER_ACTION[filter as Exclude<TxnFilter, "all">]);
    const total = rows.reduce((s, t) => s + toUSD(t.total, t.currency), 0);
    return { rows, total };
  }, [yearTxns, month, filter, toUSD]);

  const yearIdx = year != null ? years.indexOf(year) : -1;
  const canNewer = yearIdx > 0;
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

      <HistoryModeToggle mode={mode} setMode={setMode} />

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

      {/* Action filter */}
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

      {/* Month filter */}
      {monthsWithData.length > 0 && (
        <div className="pk-chips pk-scroll">
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
          <p className="pk-note warn">Couldn’t load transactions.</p>
        ) : loading ? (
          <p className="pk-note">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="pk-note">No transactions in this period.</p>
        ) : (
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
        )}
      </section>
    </div>
  );
}

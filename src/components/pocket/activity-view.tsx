"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Clock, Search, SlidersHorizontal, X } from "lucide-react";
import type {
  Basis,
  CashFlowRow,
  HistoryMode,
  PositionRunRate,
  TickerAgg,
  TransactionRow,
} from "@/lib/pocket-types";
import { ACCT_LABELS, inAccountScope, rollupTickers } from "@/lib/pocket-types";
import { Panel } from "./terminal/panel";
import { DenseTable } from "./terminal/dense-table";
import { MetricCell } from "./terminal/metric-cell";
import { NumberText } from "./terminal/number-text";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const qtyFmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n);
// Per-share dividend rates can be sub-cent (e.g. weekly payers) — keep 4 decimals there.
const rateFmt = (n: number) => (n >= 0.01 ? money(n) : n.toFixed(4));

/** "Jun 9, 2026 · Tue" — the row/card date grammar of the reference design. */
const fmtLong = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  const dow = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d);
  return `${date} · ${dow}`;
};

const daysUntil = (iso: string): number => {
  const target = Date.parse(`${iso}T00:00:00Z`);
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - todayUTC) / 86400000);
};

/** "IN 2d" / "TODAY" chip text on the banner cards. */
const inChip = (iso: string): string => {
  const d = daysUntil(iso);
  return d <= 0 ? "TODAY" : `IN ${d}d`;
};

const MODE_OPTS: { value: HistoryMode; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "dividends", label: "Received" },
  { value: "transactions", label: "Trades" },
  { value: "cashflow", label: "Cash" },
];

const SECTION_LABEL: Record<HistoryMode, string> = {
  upcoming: "Upcoming dividends",
  dividends: "Payment history",
  transactions: "Trade history",
  cashflow: "Cash history",
};

// M7: module-level stale-while-revalidate caches — re-entering the tab shows the
// last response instantly while a background refetch reconciles.
let calCache: TransactionRow[] | null = null;
const cashCache = new Map<number, { items: CashFlowRow[]; years: number[] }>();
// The chosen view + account filter survive leaving/re-entering the tab (the
// component remounts on every entry).
let lastMode: HistoryMode = "dividends";
let lastAcct = "all"; // "all" | an account type (TFSA/RRSP/…)

interface Props {
  basis: Basis;
  fxRate: number | null; // USDCAD
  fxFallback: boolean; // the server rate is a fallback — flag converted figures (L1)
  positions: PositionRunRate[]; // run-rate positions (upcoming + banner rollup)
  accountTypes: string[]; // distinct REAL account types held (the account dropdown)
  loading: boolean; // run-rate (upcoming) load state
}

/**
 * Activity — single scrolling surface in the reference-app style:
 *   [Account ▾][Year ▾] dropdown row → search + filter-icon row → (expandable)
 *   View chips (Upcoming/Received/Trades/Cash) → amber upcoming banner with
 *   horizontally-scrolling next-payment cards → TOTAL summary card → section list.
 * Received/Trades read /api/transactions/calendar (real per-payment dates);
 * Cash reads /api/cash-transactions; Upcoming uses the run-rate aggregates.
 */
export function ActivityView({ basis, fxRate, fxFallback, positions, accountTypes, loading }: Props) {
  const [mode, setModeState] = useState<HistoryMode>(lastMode);
  const setMode = useCallback((m: HistoryMode) => {
    lastMode = m;
    setModeState(m);
  }, []);
  // LOCAL account filter — real accounts only ("all" | TFSA/RRSP/…), decoupled
  // from the shared Dividends/Charts portfolio selection.
  const [acct, setAcctState] = useState<string>(lastAcct);
  const setAcct = useCallback((a: string) => {
    lastAcct = a;
    setAcctState(a);
  }, []);
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Scope: [] = all accounts, else the single selected account type.
  const activeAccounts = useMemo<string[]>(() => (acct === "all" ? [] : [acct]), [acct]);
  // A stored account selection that is no longer held falls back to "All".
  useEffect(() => {
    if (acct !== "all" && accountTypes.length && !accountTypes.includes(acct)) setAcct("all");
  }, [acct, accountTypes, setAcct]);
  // Upcoming/banner aggregates for the selected account scope.
  const upcomingIncluded = useMemo<TickerAgg[]>(
    () => rollupTickers(acct === "all" ? positions : positions.filter((p) => p.accountType === acct)),
    [positions, acct]
  );

  // -- calendar (received + trades + years) --------------------------------
  const [txns, setTxns] = useState<TransactionRow[]>(() => calCache ?? []);
  const [calLoading, setCalLoading] = useState(calCache == null);
  const [calError, setCalError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/transactions/calendar", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const rows = (await res.json()) as TransactionRow[];
        if (cancelled) return;
        calCache = rows;
        setTxns(rows);
      } catch {
        if (!cancelled && !calCache) setCalError(true);
      } finally {
        if (!cancelled) setCalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // -- cash transactions (per year) ----------------------------------------
  const [cashItems, setCashItems] = useState<CashFlowRow[]>([]);
  const [cashYears, setCashYears] = useState<number[]>([]);
  const [cashLoading, setCashLoading] = useState(true);
  const [cashError, setCashError] = useState(false);
  useEffect(() => {
    const cached = cashCache.get(year);
    setCashError(false);
    if (cached) {
      setCashItems(cached.items);
      if (cached.years.length) setCashYears(cached.years);
      setCashLoading(false);
    } else {
      setCashLoading(true);
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cash-transactions?year=${year}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { items: CashFlowRow[]; years: number[] };
        if (cancelled) return;
        cashCache.set(year, { items: json.items ?? [], years: json.years ?? [] });
        setCashItems(json.items ?? []);
        if (json.years?.length) setCashYears(json.years);
      } catch {
        if (!cancelled && !cached) setCashError(true);
      } finally {
        if (!cancelled) setCashLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  // L1: fallback matches the server's DEFAULT_FX_RATE (1.35).
  const toUSD = useCallback(
    (v: number, currency: string) => (currency === "CAD" ? v / (fxRate ?? 1.35) : v),
    [fxRate]
  );
  const toCAD = useCallback(
    (v: number, currency: string) => (currency === "USD" ? v * (fxRate ?? 1.35) : v),
    [fxRate]
  );

  // -- scoping + search ------------------------------------------------------
  const q = search.trim().toUpperCase();
  const hit = useCallback((s: string) => q === "" || s.toUpperCase().includes(q), [q]);

  const scopedTxns = useMemo(
    () => txns.filter((t) => inAccountScope(t.accountType, activeAccounts)),
    [txns, activeAccounts]
  );

  // Year dropdown options: every year with any activity (trades or cash), plus the
  // current year so the dropdown never starts empty.
  const years = useMemo(() => {
    const set = new Set<number>(cashYears);
    for (const t of scopedTxns) set.add(parseInt(t.date.slice(0, 4), 10));
    set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [scopedTxns, cashYears]);
  // An account switch can drop the selected year from the options (a controlled
  // <select> with no matching <option> renders blank) — fall back to the newest.
  useEffect(() => {
    if (years.length && !years.includes(year)) setYear(years[0]);
  }, [years, year]);

  const yearStr = String(year);
  const divRows = useMemo(
    () => scopedTxns.filter((t) => t.action === "DIVIDEND" && t.date.startsWith(yearStr) && hit(t.ticker)),
    [scopedTxns, yearStr, hit]
  );
  const tradeRows = useMemo(
    () => scopedTxns.filter((t) => t.date.startsWith(yearStr) && hit(t.ticker)),
    [scopedTxns, yearStr, hit]
  );
  const cashRows = useMemo(
    () =>
      cashItems.filter(
        (t) => inAccountScope(t.portfolioAccountType, activeAccounts) && hit(t.portfolioName)
      ),
    [cashItems, activeAccounts, hit]
  );

  // -- upcoming events (banner cards + the Upcoming list) -------------------
  const pick = useCallback(
    (t: TickerAgg) => (basis === "net" ? t.perPaymentNetUSD : t.perPaymentGrossUSD),
    [basis]
  );
  const payEvents = useMemo(
    () =>
      upcomingIncluded
        .filter((t) => t.hasDividendData && t.nextPayDate && hit(t.ticker))
        .map((t) => ({
          ticker: t.ticker,
          date: t.nextPayDate as string,
          amount: pick(t),
          shares: t.shares,
          confirmed: t.dateConfirmed,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [upcomingIncluded, hit, pick]
  );
  const upEvents = useMemo(() => {
    const evts: { ticker: string; type: "ex" | "pay"; date: string; amount: number; confirmed: boolean }[] = [];
    for (const t of upcomingIncluded) {
      if (!t.hasDividendData || !hit(t.ticker)) continue;
      if (t.nextExDate) evts.push({ ticker: t.ticker, type: "ex", date: t.nextExDate, amount: pick(t), confirmed: t.dateConfirmed });
      if (t.nextPayDate) evts.push({ ticker: t.ticker, type: "pay", date: t.nextPayDate, amount: pick(t), confirmed: t.dateConfirmed });
    }
    return evts.sort((a, b) => a.date.localeCompare(b.date) || (a.type === "ex" ? -1 : 1));
  }, [upcomingIncluded, hit, pick]);

  const bannerTotal = payEvents.reduce((s, e) => s + e.amount, 0);

  // -- mode summary (reflects the visible/filtered rows) ---------------------
  const summary = useMemo(() => {
    if (mode === "upcoming") {
      const n = payEvents.length;
      return {
        label: "Upcoming",
        value: `$${money(bannerTotal)}`,
        green: true,
        sub: `${n} payment${n === 1 ? "" : "s"}`,
        sub2: n > 0 ? `Avg $${money(bannerTotal / n)}` : null,
      };
    }
    if (mode === "dividends") {
      // Calendar DIVIDEND rows carry the actual cash received (net) only — say so,
      // since the upcoming banner above can be showing gross-basis figures.
      const total = divRows.reduce((s, t) => s + toUSD(t.total, t.currency), 0);
      const n = divRows.length;
      return {
        label: `Total ${year} · net`,
        value: `$${money(total)}`,
        green: true,
        sub: `${n} payment${n === 1 ? "" : "s"}`,
        sub2: n > 0 ? `Avg $${money(total / n)}` : null,
      };
    }
    if (mode === "transactions") {
      // Signed net flow: money OUT on a buy, IN on a sell/dividend (L5).
      const total = tradeRows.reduce(
        (s, t) => s + (t.action === "BUY" ? -1 : 1) * toUSD(t.total, t.currency),
        0
      );
      const n = tradeRows.length;
      return {
        label: `Net flow ${year}`,
        value: `${total < 0 ? "−" : ""}$${money(Math.abs(total))}`,
        green: false,
        sub: `${n} transaction${n === 1 ? "" : "s"}`,
        sub2: null,
      };
    }
    // cashflow: gross deposits ("contributed") — the contribution-room figure.
    const deposits = cashRows.filter((t) => t.action === "DEPOSIT");
    const total = deposits.reduce((s, t) => s + toCAD(t.amount, t.currency), 0);
    return {
      label: `Contributed ${year}`,
      value: `C$${money(total)}`,
      green: false,
      sub: `${deposits.length} deposit${deposits.length === 1 ? "" : "s"}`,
      sub2: null,
    };
  }, [mode, payEvents, bannerTotal, divRows, tradeRows, cashRows, year, toUSD, toCAD]);

  const histLoading = mode === "cashflow" ? cashLoading : calLoading;
  const histError = mode === "cashflow" ? cashError : calError;
  // The summary card's loading flag must match the mode's data source — Upcoming
  // reads the run-rate `loading`, not the calendar/cash fetches (no "$0.00" flash).
  const sumLoading = mode === "upcoming" ? loading : histLoading;

  return (
    <div className="pk-activity">
      <h1 className="pk-title">Activity</h1>

      {/* Account + Year dropdowns — native selects (iOS wheel) styled as cards. */}
      <div className="pk-act-controls">
        <div className="pk-select">
          <select aria-label="Account" value={acct} onChange={(e) => setAcct(e.target.value)}>
            <option value="all">All Accounts</option>
            {accountTypes.map((a) => (
              <option key={a} value={a}>
                {ACCT_LABELS[a] ?? a}
              </option>
            ))}
          </select>
          <ChevronDown className="pk-select-caret" size={16} strokeWidth={2.5} aria-hidden focusable="false" />
        </div>
        <div className="pk-select" data-disabled={mode === "upcoming"}>
          <select
            aria-label="Year"
            value={year}
            disabled={mode === "upcoming"}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <ChevronDown className="pk-select-caret" size={16} strokeWidth={2.5} aria-hidden focusable="false" />
        </div>
      </div>

      {/* Search with the filter toggle INSIDE the field (reference layout). */}
      <div className="pk-search">
        <Search className="pk-search-ico" size={17} strokeWidth={2.2} aria-hidden focusable="false" />
        <input
          type="search"
          placeholder={mode === "cashflow" ? "Search account..." : "Search symbol..."}
          aria-label={mode === "cashflow" ? "Search account" : "Search symbol"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
        {search !== "" && (
          <button type="button" className="pk-search-clear" aria-label="Clear search" onClick={() => setSearch("")}>
            <X size={15} strokeWidth={2.4} aria-hidden focusable="false" />
          </button>
        )}
        <button
          type="button"
          className="pk-filterbtn"
          aria-label="Choose view"
          aria-expanded={filtersOpen}
          data-active={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <SlidersHorizontal size={17} strokeWidth={2.2} aria-hidden focusable="false" />
        </button>
      </div>

      {filtersOpen && (
        <div className="pk-filter-panel" role="group" aria-label="Activity view">
          {MODE_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="pk-chip"
              data-active={mode === o.value}
              aria-pressed={mode === o.value}
              onClick={() => setMode(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {/* Amber banner: next payments at a glance, horizontally scrolling cards. */}
      {!loading && payEvents.length > 0 && (
        <div className="pk-banner">
          <div className="pk-banner-head">
            <Clock size={14} strokeWidth={2.4} aria-hidden focusable="false" />
            <span>
              {payEvents.length} Upcoming Dividend{payEvents.length === 1 ? "" : "s"} · ${money(bannerTotal)}
            </span>
          </div>
          <div className="pk-banner-cards" role="list">
            {payEvents.slice(0, 8).map((e) => (
              <div className="pk-bcard" role="listitem" key={e.ticker}>
                <span className="pk-bcard-chip">{inChip(e.date)}</span>
                <span className="pk-bcard-ticker">{e.ticker}</span>
                <span className="pk-bcard-amt">${money(e.amount)}</span>
                {e.shares > 0 && (
                  // ≈ — the rate is derived (USD per-payment ÷ shares), not the
                  // declared per-share figure (which may be CAD-listed).
                  <span className="pk-bcard-sub">
                    {qtyFmt(e.shares)} sh × ≈${rateFmt(e.amount / e.shares)}
                  </span>
                )}
                <span className="pk-bcard-sub">
                  {!e.confirmed && (
                    <>
                      <span className="pk-sr-only">estimated </span>
                      <Clock className="pk-est-ico" size={11} strokeWidth={2.2} aria-hidden focusable="false" />
                    </>
                  )}
                  {fmtLong(e.date)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mode summary — MDD metric panel. */}
      <Panel
        title="SUMMARY"
        titleRight={
          (fxFallback || fxRate == null) && mode !== "upcoming" ? (
            <span className="font-mono text-[9px] uppercase tracking-wider text-warn">default FX</span>
          ) : undefined
        }
        loading={sumLoading}
      >
        <div className="flex items-end justify-between gap-3">
          <MetricCell
            label={summary.label}
            value={sumLoading ? "—" : summary.value}
            intent={summary.green ? "pos" : "neutral"}
            size="lg"
          />
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-low">
              {sumLoading ? "" : summary.sub}
            </span>
            {!sumLoading && summary.sub2 && (
              <span className="font-mono text-[10px] text-text-low">{summary.sub2}</span>
            )}
          </div>
        </div>
      </Panel>

      {/* Section list — MDD dense sortable table per mode (header bar = label). */}
      {mode === "upcoming" && (
        <Panel title={SECTION_LABEL[mode]} loading={loading} bodyClassName="p-0">
          <DenseTable
            columns={[
              { key: "ticker", header: "SYMBOL", sortValue: (e) => e.ticker, cell: (e) => <span className="font-medium uppercase text-text-hi">{e.ticker}</span> },
              { key: "type", header: "TYPE", sortValue: (e) => e.type, cell: (e) => <span className="text-text-mid">{e.type === "ex" ? "EX" : "PAY"}</span> },
              { key: "date", header: "DATE", sortValue: (e) => e.date, cell: (e) => <span className="text-text-mid">{e.confirmed ? "" : "~"}{e.date}</span> },
              { key: "amt", header: "PER PMT", align: "right", sortValue: (e) => e.amount, cell: (e) => <NumberText value={`$${money(e.amount)}`} intent="cyan" /> },
            ]}
            data={upEvents}
            initialSort={{ key: "date", desc: false }}
            emptyText="NO UPCOMING"
          />
        </Panel>
      )}

      {mode === "dividends" && (
        <Panel title={SECTION_LABEL[mode]} loading={histLoading} error={histError ? "Couldn't load history" : null} bodyClassName="p-0">
          <DenseTable
            columns={[
              { key: "ticker", header: "SYMBOL", sortValue: (t) => t.ticker, cell: (t) => <span className="font-medium uppercase text-text-hi">{t.ticker}</span> },
              { key: "date", header: "DATE", sortValue: (t) => t.date, cell: (t) => <span className="text-text-mid">{t.date}</span> },
              { key: "acct", header: "ACCT", sortValue: (t) => t.accountType, cell: (t) => <span className="text-text-mid">{ACCT_LABELS[t.accountType] ?? t.accountType}</span> },
              { key: "amt", header: "AMOUNT", align: "right", sortValue: (t) => toUSD(t.total, t.currency), cell: (t) => <NumberText value={`+$${money(toUSD(t.total, t.currency))}`} intent="pos" /> },
            ]}
            data={divRows}
            initialSort={{ key: "date", desc: true }}
            emptyText={`NO DIVIDENDS IN ${year}`}
          />
        </Panel>
      )}

      {mode === "transactions" && (
        <Panel title={SECTION_LABEL[mode]} loading={histLoading} error={histError ? "Couldn't load transactions" : null} bodyClassName="p-0">
          <DenseTable
            columns={[
              { key: "ticker", header: "SYMBOL", sortValue: (t) => t.ticker, cell: (t) => <span className="font-medium uppercase text-text-hi">{t.ticker}</span> },
              { key: "action", header: "ACTION", sortValue: (t) => t.action, cell: (t) => <span className="text-text-mid">{t.action === "DIVIDEND" ? "DIV" : t.action}</span> },
              { key: "date", header: "DATE", sortValue: (t) => t.date, cell: (t) => <span className="text-text-mid">{t.date}</span> },
              { key: "amt", header: "AMOUNT", align: "right", sortValue: (t) => (t.action === "BUY" ? -1 : 1) * toUSD(t.total, t.currency), cell: (t) => <NumberText value={`${t.action === "BUY" ? "−" : "+"}$${money(toUSD(t.total, t.currency))}`} intent={t.action === "BUY" ? "neg" : "pos"} /> },
            ]}
            data={tradeRows}
            initialSort={{ key: "date", desc: true }}
            emptyText={`NO TRANSACTIONS IN ${year}`}
          />
        </Panel>
      )}

      {mode === "cashflow" && (
        <Panel title={SECTION_LABEL[mode]} loading={histLoading} error={histError ? "Couldn't load cash flow" : null} bodyClassName="p-0">
          <DenseTable
            columns={[
              { key: "acct", header: "ACCOUNT", sortValue: (t) => t.portfolioName, cell: (t) => <span className="truncate text-text-hi">{t.portfolioName}</span> },
              { key: "type", header: "ACCT", sortValue: (t) => t.portfolioAccountType, cell: (t) => <span className="text-text-mid">{ACCT_LABELS[t.portfolioAccountType] ?? t.portfolioAccountType}</span> },
              { key: "date", header: "DATE", sortValue: (t) => t.date, cell: (t) => <span className="text-text-mid">{t.date}</span> },
              { key: "amt", header: "AMOUNT", align: "right", sortValue: (t) => (t.action === "DEPOSIT" ? 1 : -1) * toCAD(t.amount, t.currency), cell: (t) => <NumberText value={`${t.action === "DEPOSIT" ? "+" : "−"}C$${money(toCAD(t.amount, t.currency))}`} intent={t.action === "DEPOSIT" ? "pos" : "neg"} /> },
            ]}
            data={cashRows}
            initialSort={{ key: "date", desc: true }}
            emptyText={`NO CASH ACTIVITY IN ${year}`}
          />
        </Panel>
      )}
    </div>
  );
}

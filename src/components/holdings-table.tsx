"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AddHoldingDialog } from "./add-holding-dialog";
import { HoldingDetailPanel } from "./holding-detail-panel";
import { mergeHoldings } from "@/lib/utils";

interface Transaction {
  id: string;
  action: "BUY" | "SELL" | "DIVIDEND";
  quantity: string;
  price: string;
  commission: string;
  date?: string;
  notes?: string | null;
}

interface Holding {
  id: string;
  ticker: string;
  name: string | null;
  currency: "USD" | "CAD";
  quantity: string | null;
  avgCost: string | null;
  transactions: Transaction[];
}

interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  week52High: number;
  week52Low: number;
  fromHighPct: number;
  fromLowPct: number;
  dividendRate: number | null;
  dividendYield: number | null;
  trailingAnnualDividendRate: number | null;
  trailingAnnualDividendYield: number | null;
  exDividendDate: string | null;
  dividendDate: string | null;
  payoutRatio: number | null;
}

export interface HoldingRow {
  holding: Holding;
  shares: number;
  avgCost: number;
  costBasis: number;
  price: PriceData | null;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
}

function calcHolding(holding: Holding): Omit<HoldingRow, "price" | "marketValue" | "unrealizedPnL" | "unrealizedPnLPct"> {
  const txns = holding.transactions ?? [];
  const buys = txns.filter((t) => t.action === "BUY");
  const sells = txns.filter((t) => t.action === "SELL");
  const totalBought = buys.reduce((s, t) => s + parseFloat(t.quantity), 0);
  const totalSold = sells.reduce((s, t) => s + parseFloat(t.quantity), 0);
  const totalCost = buys.reduce(
    (s, t) => s + parseFloat(t.quantity) * parseFloat(t.price) + parseFloat(t.commission),
    0
  );
  const shares = holding.quantity != null
    ? parseFloat(holding.quantity)
    : totalBought - totalSold;
  const avgCost = holding.avgCost != null
    ? parseFloat(holding.avgCost)
    : (totalBought > 0 ? totalCost / totalBought : 0);
  const costBasis = avgCost * shares;
  return { holding, shares, avgCost, costBasis };
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function HoldingsTable({
  portfolioId,
  initialHoldings,
  onHoldingsChange,
  onDetailOpen,
  readOnly = false,
  displayCurrency,
  allPortfolios,
}: {
  portfolioId: string;
  initialHoldings: Holding[];
  onHoldingsChange: (rows: Array<{ ticker: string; name?: string | null; marketValue: number; costBasis: number; unrealizedPnL: number; unrealizedPnLPct: number; dayChange: number; annualDividend?: number; currency: "USD" | "CAD" }>) => void;
  onDetailOpen?: (open: boolean) => void;
  readOnly?: boolean;
  displayCurrency?: "USD" | "CAD";
  allPortfolios?: { id: string; name: string }[];
}) {
  const [holdings, setHoldings] = useState(initialHoldings);
  const [prices, setPrices] = useState<Record<string, PriceData | null>>({});
  const [priceReasons, setPriceReasons] = useState<Record<string, "not_found" | "network">>({});
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [colMode, setColMode] = useState<"usd" | "pct">("usd");
  const [priceMode, setPriceMode] = useState<"price" | "avg">("price");
  const [mktMode, setMktMode] = useState<"mkt" | "cost">("mkt");
  const [wgtMode, setWgtMode] = useState<"pct" | "alloc">("pct");
  const [w52Mode, setW52Mode] = useState<"high" | "low">("high");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dayMode, setDayMode] = useState<"day" | "yld" | "yoc">("day");
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [dividendCuts, setDividendCuts] = useState<Set<string>>(new Set());
  const [dividendCutPcts, setDividendCutPcts] = useState<Record<string, number>>({});
  const [dividendHistory, setDividendHistory] = useState<Set<string>>(new Set());
  const [investTargets, setInvestTargets] = useState<Record<string, number>>({});
  const [investContrib, setInvestContrib] = useState<{ amount: number; currency: "USD" | "CAD" } | null>(null);
  const [fxRate, setFxRate] = useState(1.35);

  const toDisp = (value: number, holdingCurrency: "USD" | "CAD") => {
    if (!displayCurrency || displayCurrency === holdingCurrency) return value;
    return displayCurrency === "CAD" ? value * fxRate : value / fxRate;
  };
  const dispSym = displayCurrency === "CAD" ? "C$" : displayCurrency === "USD" ? "$" : null;

  useEffect(() => {
    fetch("/api/settings/investment").then(r => r.json()).then(d => {
      const targets: Record<string, number> = {};
      for (const [ticker, val] of Object.entries(d.targets ?? {})) {
        targets[ticker] = (val as { pct: number }).pct;
      }
      setInvestTargets(targets);
      if (d.contribution) setInvestContrib({ amount: d.contribution.amount, currency: d.contribution.currency });
    }).catch(() => {});
    fetch("/api/fx").then(r => r.json()).then(d => { if (d.rate) setFxRate(d.rate); }).catch(() => {});
    fetch("/api/dividend-growth").then(r => r.json()).then(d => {
      const map: Record<string, number> = {};
      const cutPcts: Record<string, number> = {};
      const history = new Set<string>();
      const cutsSet = new Set<string>(d.cuts ?? []);
      for (const t of (d.tickers ?? [])) {
        map[t.ticker] = t.streak ?? 0;
        history.add(t.ticker);
        if (cutsSet.has(t.ticker)) {
          const last = t.history?.[t.history.length - 1];
          if (last?.growthPct != null) cutPcts[t.ticker] = last.growthPct;
        }
      }
      setStreaks(map);
      setDividendCuts(cutsSet);
      setDividendCutPcts(cutPcts);
      setDividendHistory(history);
    }).catch(() => {});
  }, []);

  const cycleColMode = () => setColMode(m => m === "usd" ? "pct" : "usd");

  const cycleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === "desc") setSortDir("asc");
      else setSortCol(null);
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };
  const si = (col: string) => sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const selectRow = useCallback((id: string | null) => {
    setSelectedRowId(id);
    onDetailOpen?.(id !== null);
  }, [onDetailOpen]);

  const fetchPrices = useCallback(async (hs: Holding[]) => {
    const results: Record<string, PriceData | null> = {};
    const reasons: Record<string, "not_found" | "network"> = {};
    await Promise.all(
      hs.map(async (h) => {
        try {
          const res = await fetch(`/api/price/${h.ticker}`);
          if (res.ok) {
            results[h.ticker] = await res.json();
          } else {
            results[h.ticker] = null;
            const errData = await res.json().catch(() => ({}));
            reasons[h.ticker] = errData.reason ?? "network";
          }
        } catch {
          results[h.ticker] = null;
          reasons[h.ticker] = "network";
        }
      })
    );
    setPrices(results);
    setPriceReasons(reasons);
    setLoadingPrices(false);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/portfolios`);
    const all = await res.json() as { id: string; holdings: Holding[] }[];
    let updated: Holding[];
    if (portfolioId === "all") {
      updated = mergeHoldings(all);
    } else {
      const portfolio = all.find(p => p.id === portfolioId);
      if (!portfolio) return;
      updated = portfolio.holdings;
    }
    setHoldings(updated);
    await fetchPrices(updated);
  }, [portfolioId, fetchPrices]);

  useEffect(() => {
    setHoldings(initialHoldings);
    fetchPrices(initialHoldings);
  }, [initialHoldings, fetchPrices]);

  const rows: HoldingRow[] = useMemo(() =>
    holdings
      .map((h) => {
        const base = calcHolding(h);
        const price = prices[h.ticker] ?? null;
        const marketValue = price ? base.shares * price.price : 0;
        const unrealizedPnL = marketValue - base.costBasis;
        const unrealizedPnLPct = base.costBasis > 0 ? (unrealizedPnL / base.costBasis) * 100 : 0;
        return { ...base, price, marketValue, unrealizedPnL, unrealizedPnLPct };
      })
      .filter((r) => r.shares > 0 || (r.holding.quantity === null && (r.holding.transactions ?? []).length === 0)),
    [holdings, prices]
  );

  const totalMarketValue = rows.reduce((s, r) => s + r.marketValue, 0);

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      let va = 0, vb = 0;
      if (sortCol === "ticker") {
        const cmp = a.holding.ticker.localeCompare(b.holding.ticker);
        return sortDir === "asc" ? cmp : -cmp;
      }
      switch (sortCol) {
        case "shares": va = a.shares; vb = b.shares; break;
        case "price": va = priceMode === "price" ? (a.price?.price ?? 0) : a.avgCost; vb = priceMode === "price" ? (b.price?.price ?? 0) : b.avgCost; break;
        case "day": {
          const getDayVal = (r: HoldingRow) => {
            if (dayMode === "day") return r.price?.changePercent ?? 0;
            if (dayMode === "yld") return r.price?.trailingAnnualDividendYield ?? r.price?.dividendYield ?? 0;
            const rate = r.price?.trailingAnnualDividendRate ?? r.price?.dividendRate ?? 0;
            return rate > 0 && r.costBasis > 0 ? (rate * r.shares / r.costBasis) * 100 : 0;
          };
          va = getDayVal(a); vb = getDayVal(b); break;
        }
        case "mkt": va = mktMode === "mkt" ? a.marketValue : a.costBasis; vb = mktMode === "mkt" ? b.marketValue : b.costBasis; break;
        case "wgt": va = a.marketValue; vb = b.marketValue; break;
        case "pnl": va = colMode === "usd" ? a.unrealizedPnL : a.unrealizedPnLPct; vb = colMode === "usd" ? b.unrealizedPnL : b.unrealizedPnLPct; break;
        case "w52": va = w52Mode === "high" ? (a.price?.fromHighPct ?? 0) : (a.price?.fromLowPct ?? 0); vb = w52Mode === "high" ? (b.price?.fromHighPct ?? 0) : (b.price?.fromLowPct ?? 0); break;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [rows, sortCol, sortDir, priceMode, mktMode, colMode, w52Mode, dayMode]);

  const totalsByCur = rows.reduce((acc, r) => {
    const c = r.holding.currency;
    acc[c] = acc[c] ?? { mkt: 0, cost: 0, pnl: 0 };
    acc[c].mkt += r.marketValue;
    acc[c].cost += r.costBasis;
    acc[c].pnl += r.unrealizedPnL;
    return acc;
  }, {} as Record<string, { mkt: number; cost: number; pnl: number }>);

  const totalCurrencies = Object.keys(totalsByCur) as ("USD" | "CAD")[];
  const fmtTotal = (mode: "mkt" | "cost") => {
    if (dispSym) {
      const total = totalCurrencies.reduce((sum, c) => {
        const s = totalsByCur[c];
        return sum + toDisp(mode === "mkt" ? s.mkt : s.cost, c);
      }, 0);
      return `${dispSym}${fmt(total)}`;
    }
    return totalCurrencies.map(c => {
      const s = totalsByCur[c];
      const val = mode === "mkt" ? s.mkt : s.cost;
      return `${c === "CAD" ? "C$" : "$"}${fmt(val)}`;
    }).join(" / ");
  };
  const fmtTotalPnL = () => {
    if (dispSym) {
      const total = totalCurrencies.reduce((sum, c) => sum + toDisp(totalsByCur[c].pnl, c), 0);
      return `${total >= 0 ? "+" : ""}${dispSym}${fmt(Math.abs(total))}`;
    }
    return totalCurrencies.map(c => {
      const s = totalsByCur[c];
      return `${s.pnl >= 0 ? "+" : ""}${c === "CAD" ? "C$" : "$"}${fmt(Math.abs(s.pnl))}`;
    }).join(" / ");
  };
  const fmtTotalPnLPct = () => {
    if (dispSym) {
      const totalCost = totalCurrencies.reduce((sum, c) => sum + toDisp(totalsByCur[c].cost, c), 0);
      const totalPnL = totalCurrencies.reduce((sum, c) => sum + toDisp(totalsByCur[c].pnl, c), 0);
      return totalCost > 0 ? fmtPct((totalPnL / totalCost) * 100) : "—";
    }
    return totalCurrencies.map(c => {
      const s = totalsByCur[c];
      const pct = s.cost > 0 ? (s.pnl / s.cost) * 100 : 0;
      return fmtPct(pct);
    }).join(" / ");
  };
  const totalPnLPositive = totalCurrencies.every(c => totalsByCur[c].pnl >= 0);

  // Contribution allocation (Excel Funds column logic)
  // contrib is always in CAD; convert to each stock's native currency
  const contribCAD = investContrib
    ? (investContrib.currency === "CAD" ? investContrib.amount : investContrib.amount * fxRate)
    : 0;

  const totalPositiveGapPct = rows.reduce((sum, r) => {
    const w = totalMarketValue > 0 ? (r.marketValue / totalMarketValue) * 100 : 0;
    const targetPct = investTargets[r.holding.ticker] ?? 0;
    return sum + Math.max(0, targetPct - w);
  }, 0);

  // Map ticker → alloc amount in stock's native currency
  const allocMap: Record<string, number> = {};
  if (contribCAD > 0 && totalPositiveGapPct > 0) {
    for (const r of rows) {
      const w = totalMarketValue > 0 ? (r.marketValue / totalMarketValue) * 100 : 0;
      const targetPct = investTargets[r.holding.ticker] ?? 0;
      const gap = Math.max(0, targetPct - w);
      const allocCAD = (gap / totalPositiveGapPct) * contribCAD;
      // Convert to stock's native currency
      allocMap[r.holding.ticker] = r.holding.currency === "USD" ? allocCAD / fxRate : allocCAD;
    }
  }

  useEffect(() => {
    if (loadingPrices) return;
    onHoldingsChange(
      rows.map((r) => ({
        ticker: r.holding.ticker,
        marketValue: r.marketValue,
        costBasis: r.costBasis,
        unrealizedPnL: r.unrealizedPnL,
        unrealizedPnLPct: r.unrealizedPnLPct,
        dayChange: r.price ? r.price.change * r.shares : 0,
        annualDividend: r.price
          ? ((r.price.trailingAnnualDividendRate ?? r.price.dividendRate ?? 0) * r.shares)
          : 0,
        name: r.holding.name,
        currency: r.holding.currency,
      }))
    );
  }, [prices, holdings, loadingPrices, onHoldingsChange]);

  const selectedRow = sortedRows.find((r) => r.holding.id === selectedRowId) ?? null;

  return (
    <div>
      <div>
        <div className="flex items-center justify-between mb-3">
          {rows.length > 0 ? (
            <span className="text-[10px] text-muted-foreground">
              {rows.length} POSITION{rows.length !== 1 ? "S" : ""}
            </span>
          ) : <span />}
          {!readOnly && <AddHoldingDialog portfolioId={portfolioId} onAdd={refresh} />}
        </div>
        {rows.length === 0 ? (
          <div className="text-muted-foreground text-xs py-8 text-center border border-dashed border-border">
            NO POSITIONS — ADD A STOCK TO BEGIN
          </div>
        ) : (
          <>
          {/* Mobile card list (< sm) */}
          <div className="sm:hidden space-y-2">
            {sortedRows.map((row) => {
              const cur = dispSym ?? (row.holding.currency === "CAD" ? "C$" : "$");
              const weight = totalMarketValue > 0 ? (row.marketValue / totalMarketValue) * 100 : 0;
              const priceUnavailable = !loadingPrices && !row.price;
              const priceReason = priceReasons[row.holding.ticker];
              return (
                <div
                  key={row.holding.id}
                  className={`border border-border p-3 cursor-pointer active:bg-border/20 ${selectedRowId === row.holding.id ? "bg-border/30 border-accent" : "bg-card"}`}
                  onClick={() => selectRow(row.holding.id)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <span className="text-accent font-medium text-sm">{row.holding.ticker}</span>
                      <div className="text-muted-foreground/60 text-[10px] mt-0.5 tabular-nums">
                        {Number.isInteger(row.shares) ? fmt(row.shares, 0) : fmt(row.shares, row.shares < 10 ? 4 : 2)}sh
                      </div>
                      {row.holding.name && row.holding.name !== row.holding.ticker && (
                        <div className="text-muted-foreground text-[10px] mt-0.5 truncate" title={row.holding.name}>{row.holding.name}</div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {loadingPrices ? (
                        <span className="text-muted-foreground text-xs">...</span>
                      ) : priceUnavailable ? (
                        <span className="text-negative text-xs font-medium" title={priceReason === "not_found" ? "Ticker not found — may be delisted or invalid" : "Price data unavailable"}>
                          {priceReason === "not_found" ? "DELISTED?" : "PRICE N/A"}
                        </span>
                      ) : (
                        <span className="text-sm tabular-nums font-medium">{cur}{fmt(toDisp(row.price!.price, row.holding.currency))}</span>
                      )}
                      {row.price && (
                        <div className={`text-[10px] tabular-nums ${row.price.changePercent >= 0 ? "text-positive" : "text-negative"}`}>
                          {fmtPct(row.price.changePercent)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] gap-2">
                    <span className="text-muted-foreground tabular-nums">
                      {row.marketValue > 0 ? `${cur}${fmt(toDisp(row.marketValue, row.holding.currency))}` : "—"}
                    </span>
                    <span className={`tabular-nums ${row.unrealizedPnL >= 0 ? "text-positive" : "text-negative"}`}>
                      {row.marketValue > 0
                        ? `${row.unrealizedPnL >= 0 ? "+" : ""}${cur}${fmt(Math.abs(toDisp(row.unrealizedPnL, row.holding.currency)))} (${fmtPct(row.unrealizedPnLPct)})`
                        : "—"}
                    </span>
                    <span className="text-muted-foreground tabular-nums flex-shrink-0">
                      {totalMarketValue > 0 ? `${weight.toFixed(1)}%` : "—"}
                    </span>
                    {dividendCuts.has(row.holding.ticker) ? (
                      <span className="text-[11px] flex-shrink-0 text-negative" title="Dividend cut in most recent year">
                        ↓{dividendCutPcts[row.holding.ticker] != null ? `${dividendCutPcts[row.holding.ticker].toFixed(0)}%` : " CUT"}
                      </span>
                    ) : (streaks[row.holding.ticker] ?? 0) > 0 ? (
                      <span className={`text-[11px] flex-shrink-0 ${(streaks[row.holding.ticker] ?? 0) >= 5 ? "text-positive" : "text-muted-foreground"}`} title={`${streaks[row.holding.ticker]} consecutive years of dividend growth`}>
                        ↑{streaks[row.holding.ticker]}Y
                      </span>
                    ) : dividendHistory.has(row.holding.ticker) ? (
                      <span className="text-[11px] flex-shrink-0 text-muted-foreground/50" title="Dividend unchanged">—</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table (sm+) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-max">
              <thead>
                <tr>
                  <th className="w-20 cursor-pointer select-none hover:text-accent transition-colors" onClick={() => cycleSort("ticker")}>TICKER{si("ticker")}</th>
                  <th className="text-left w-32 hidden lg:table-cell cursor-pointer select-none hover:text-accent transition-colors" onClick={() => cycleSort("ticker")}>NAME{si("ticker")}</th>
                  <th className="text-right w-24 cursor-pointer select-none hover:text-accent transition-colors" onClick={() => cycleSort("shares")}>SHARES{si("shares")}</th>
                  <th
                    className="text-right w-24 cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => { setPriceMode(m => m === "price" ? "avg" : "price"); cycleSort("price"); }}
                    title="Click to sort / toggle PRICE / AVG COST"
                  >
                    {priceMode === "price" ? "PRICE" : "AVG"}{si("price") || " ▾"}
                  </th>
                  <th
                    className="text-right w-20 hidden sm:table-cell cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => { setDayMode(m => m === "day" ? "yld" : m === "yld" ? "yoc" : "day"); cycleSort("day"); }}
                    title="Click to sort / toggle DAY % / YLD % / YOC"
                  >
                    {dayMode === "day" ? "DAY" : dayMode === "yld" ? "YLD" : "YOC"}{si("day") || " ▾"}
                  </th>
                  <th
                    className="text-right w-28 cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => { setMktMode(m => m === "mkt" ? "cost" : "mkt"); cycleSort("mkt"); }}
                    title="Click to sort / toggle MKT VALUE / COST BASIS"
                  >
                    {mktMode === "mkt" ? "MKT" : "COST"}{si("mkt") || " ▾"}
                  </th>
                  <th
                    className="text-right w-16 hidden sm:table-cell cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => { setWgtMode(m => m === "pct" ? "alloc" : "pct"); cycleSort("wgt"); }}
                    title="Click to sort / toggle WEIGHT / ALLOCATION"
                  >
                    {wgtMode === "pct" ? "WGT" : "ALLOC"}{si("wgt") || " ▾"}
                  </th>
                  <th
                    className="text-right w-28 cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => { cycleColMode(); cycleSort("pnl"); }}
                    title="Click to sort / toggle P&L $ / P&L %"
                  >
                    {colMode === "usd" ? "P&L $" : "P&L %"}{si("pnl") || " ▾"}
                  </th>
                  <th
                    className="text-right w-24 hidden sm:table-cell cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => { setW52Mode(m => m === "high" ? "low" : "high"); cycleSort("w52"); }}
                    title="Click to sort / toggle 52W HIGH / LOW"
                  >
                    {w52Mode === "high" ? "52W H" : "52W L"}{si("w52") || " ▾"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const cur = dispSym ?? (row.holding.currency === "CAD" ? "C$" : "$");
                  const weight = totalMarketValue > 0 ? (row.marketValue / totalMarketValue) * 100 : 0;
                  const deskPriceReason = priceReasons[row.holding.ticker];
                  return (
                    <tr
                      key={row.holding.id}
                      className={`cursor-pointer ${selectedRowId === row.holding.id ? "bg-border/30" : ""}`}
                      onClick={() => selectRow(row.holding.id)}
                    >
                      <td className="font-medium text-accent">
                        <span>{row.holding.ticker}</span>
                        {dividendCuts.has(row.holding.ticker) ? (
                          <span className="ml-1 text-[9px] text-negative" title="Dividend cut in most recent year">
                            ↓{dividendCutPcts[row.holding.ticker] != null ? `${dividendCutPcts[row.holding.ticker].toFixed(0)}%` : ""}
                          </span>
                        ) : (streaks[row.holding.ticker] ?? 0) > 0 ? (
                          <span className={`ml-1 text-[9px] ${(streaks[row.holding.ticker] ?? 0) >= 5 ? "text-positive" : "text-muted-foreground"}`} title={`${streaks[row.holding.ticker]} consecutive years of dividend growth`}>
                            ↑{streaks[row.holding.ticker]}
                          </span>
                        ) : dividendHistory.has(row.holding.ticker) ? (
                          <span className="ml-1 text-[9px] text-muted-foreground/50" title="Dividend unchanged in most recent year">—</span>
                        ) : null}
                      </td>
                      <td className="text-muted-foreground text-xs truncate max-w-[8rem] hidden lg:table-cell">
                        {row.holding.name || "—"}
                      </td>
                      <td className="text-right tabular-nums">
                        {Number.isInteger(row.shares) ? fmt(row.shares, 0) : fmt(row.shares, row.shares < 10 ? 4 : 2)}
                      </td>
                      <td className="text-right tabular-nums">
                        {loadingPrices ? (
                          <span className="text-muted-foreground">...</span>
                        ) : priceMode === "price"
                          ? (row.price ? `${cur}${fmt(toDisp(row.price.price, row.holding.currency))}` : <span className="text-negative text-[10px]" title={deskPriceReason === "not_found" ? "Ticker not found — may be delisted or invalid" : "Price data unavailable"}>{deskPriceReason === "not_found" ? "DELISTED?" : "PRICE N/A"}</span>)
                          : (row.avgCost > 0 ? `${cur}${fmt(toDisp(row.avgCost, row.holding.currency))}` : "—")}
                      </td>
                      <td className={`text-right tabular-nums hidden sm:table-cell ${
                        dayMode === "day"
                          ? (row.price ? (row.price.changePercent >= 0 ? "text-positive" : "text-negative") : "")
                          : "text-primary"
                      }`}>
                        {dayMode === "day"
                          ? (row.price ? fmtPct(row.price.changePercent) : "—")
                          : dayMode === "yld"
                          ? (() => {
                              const yld = row.price?.trailingAnnualDividendYield ?? row.price?.dividendYield ?? null;
                              return yld != null ? `${yld.toFixed(2)}%` : "—";
                            })()
                          : (() => {
                              const annualDivRate = row.price?.trailingAnnualDividendRate ?? row.price?.dividendRate ?? 0;
                              const yoc = (annualDivRate > 0 && row.costBasis > 0)
                                ? (annualDivRate * row.shares / row.costBasis) * 100
                                : null;
                              return yoc != null ? `${yoc.toFixed(2)}%` : "—";
                            })()
                        }
                      </td>
                      <td className="text-right tabular-nums">
                        {mktMode === "mkt"
                          ? (row.marketValue > 0 ? `${cur}${fmt(toDisp(row.marketValue, row.holding.currency))}` : "—")
                          : (row.costBasis > 0 ? `${cur}${fmt(toDisp(row.costBasis, row.holding.currency))}` : "—")}
                      </td>
                      <td className="text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                        {wgtMode === "pct"
                          ? (totalMarketValue > 0 ? `${weight.toFixed(1)}%` : "—")
                          : (() => {
                              if (!(row.holding.ticker in investTargets)) return "—";
                              const alloc = allocMap[row.holding.ticker] ?? 0;
                              return `${cur}${fmt(toDisp(alloc, row.holding.currency))}`;
                            })()}
                      </td>
                      <td className={`text-right tabular-nums ${row.unrealizedPnL >= 0 ? "text-positive" : "text-negative"}`}>
                        {row.marketValue > 0 ? (
                          colMode === "usd"
                            ? `${row.unrealizedPnL >= 0 ? "+" : ""}${cur}${fmt(Math.abs(toDisp(row.unrealizedPnL, row.holding.currency)))}`
                            : fmtPct(row.unrealizedPnLPct)
                        ) : "—"}
                      </td>
                      <td className={`hidden sm:table-cell text-right tabular-nums ${
                        w52Mode === "high"
                          ? (row.price && row.price.fromHighPct < -10 ? "text-negative" : "text-muted-foreground")
                          : (row.price && row.price.fromLowPct > 30 ? "text-positive" : "text-muted-foreground")
                      }`}>
                        {w52Mode === "high"
                          ? (row.price?.week52High ? `${cur}${fmt(toDisp(row.price.week52High, row.holding.currency))} (${fmtPct(row.price.fromHighPct)})` : "—")
                          : (row.price?.week52Low ? `${cur}${fmt(toDisp(row.price.week52Low, row.holding.currency))} (${fmtPct(row.price.fromLowPct)})` : "—")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 1 && totalCurrencies.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td className="text-xs text-muted-foreground font-medium">TOTAL</td>
                    <td className="hidden lg:table-cell" />
                    <td />
                    <td />
                    <td className="hidden sm:table-cell" />
                    <td className="text-right tabular-nums font-medium text-xs">
                      {fmtTotal(mktMode)}
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td className={`text-right tabular-nums font-medium text-xs ${totalPnLPositive ? "text-positive" : "text-negative"}`}>
                      {colMode === "usd" ? fmtTotalPnL() : fmtTotalPnLPct()}
                    </td>
                    <td className="hidden sm:table-cell" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          </>
        )}
      </div>

      {/* Detail panel — inline on desktop */}
      {selectedRow && (
        <HoldingDetailPanel
          row={selectedRow}
          readOnly={readOnly}
          onClose={() => selectRow(null)}
          onRefresh={refresh}
          totalMarketValue={totalMarketValue}
          displayCurrency={displayCurrency}
          allocAmount={allocMap[selectedRow.holding.ticker] ?? 0}
          contribCAD={contribCAD}
          fxRateForAlloc={fxRate}
          allPortfolios={allPortfolios}
        />
      )}
    </div>
  );
}

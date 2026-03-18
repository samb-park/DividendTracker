"use client";

import { useState, useEffect, useCallback } from "react";
import { AddHoldingDialog } from "./add-holding-dialog";
import { HoldingDetailPanel } from "./holding-detail-panel";

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
  const buys = holding.transactions.filter((t) => t.action === "BUY");
  const sells = holding.transactions.filter((t) => t.action === "SELL");
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
}: {
  portfolioId: string;
  initialHoldings: Holding[];
  onHoldingsChange: (rows: Array<{ ticker: string; name?: string | null; marketValue: number; costBasis: number; unrealizedPnL: number; unrealizedPnLPct: number; dayChange: number; annualDividend?: number; currency: "USD" | "CAD" }>) => void;
  onDetailOpen?: (open: boolean) => void;
  readOnly?: boolean;
  displayCurrency?: "USD" | "CAD";
}) {
  const [holdings, setHoldings] = useState(initialHoldings);
  const [prices, setPrices] = useState<Record<string, PriceData | null>>({});
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [colMode, setColMode] = useState<"usd" | "pct">("usd");
  const [priceMode, setPriceMode] = useState<"price" | "avg">("price");
  const [mktMode, setMktMode] = useState<"mkt" | "cost">("mkt");
  const [wgtMode, setWgtMode] = useState<"pct" | "alloc">("pct");
  const [w52Mode, setW52Mode] = useState<"high" | "low">("high");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [investTargets, setInvestTargets] = useState<Record<string, number>>({});
  const [investContrib, setInvestContrib] = useState<{ amount: number; currency: "USD" | "CAD" } | null>(null);
  const [fxRate, setFxRate] = useState(1.37);

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
    await Promise.all(
      hs.map(async (h) => {
        try {
          const res = await fetch(`/api/price/${h.ticker}`);
          results[h.ticker] = res.ok ? await res.json() : null;
        } catch {
          results[h.ticker] = null;
        }
      })
    );
    setPrices(results);
    setLoadingPrices(false);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/portfolios`);
    const all = await res.json();
    const portfolio = (all as { id: string; holdings: Holding[] }[]).find(p => p.id === portfolioId);
    if (portfolio) {
      setHoldings(portfolio.holdings);
      await fetchPrices(portfolio.holdings);
    }
  }, [portfolioId, fetchPrices]);

  useEffect(() => {
    setHoldings(initialHoldings);
    fetchPrices(initialHoldings);
  }, [initialHoldings, fetchPrices]);

  const rows: HoldingRow[] = holdings
    .map((h) => {
      const base = calcHolding(h);
      const price = prices[h.ticker] ?? null;
      const marketValue = price ? base.shares * price.price : 0;
      const unrealizedPnL = marketValue - base.costBasis;
      const unrealizedPnLPct = base.costBasis > 0 ? (unrealizedPnL / base.costBasis) * 100 : 0;
      return { ...base, price, marketValue, unrealizedPnL, unrealizedPnLPct };
    })
    .filter((r) => r.shares > 0 || (r.holding.quantity === null && r.holding.transactions.length === 0));

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
        case "day": va = a.price?.changePercent ?? 0; vb = b.price?.changePercent ?? 0; break;
        case "mkt": va = mktMode === "mkt" ? a.marketValue : a.costBasis; vb = mktMode === "mkt" ? b.marketValue : b.costBasis; break;
        case "wgt": va = a.marketValue; vb = b.marketValue; break;
        case "pnl": va = colMode === "usd" ? a.unrealizedPnL : a.unrealizedPnLPct; vb = colMode === "usd" ? b.unrealizedPnL : b.unrealizedPnLPct; break;
        case "w52": va = w52Mode === "high" ? (a.price?.fromHighPct ?? 0) : (a.price?.fromLowPct ?? 0); vb = w52Mode === "high" ? (b.price?.fromHighPct ?? 0) : (b.price?.fromLowPct ?? 0); break;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [rows, sortCol, sortDir, priceMode, mktMode, colMode, w52Mode]);

  const totalsByCur = rows.reduce((acc, r) => {
    const c = r.holding.currency;
    acc[c] = acc[c] ?? { mkt: 0, cost: 0, pnl: 0 };
    acc[c].mkt += r.marketValue;
    acc[c].cost += r.costBasis;
    acc[c].pnl += r.unrealizedPnL;
    return acc;
  }, {} as Record<string, { mkt: number; cost: number; pnl: number }>);

  const totalCurrencies = Object.keys(totalsByCur) as ("USD" | "CAD")[];
  const fmtTotal = (mode: "mkt" | "cost") =>
    totalCurrencies.map(c => {
      const s = totalsByCur[c];
      const val = mode === "mkt" ? s.mkt : s.cost;
      const sym = c === "CAD" ? "C$" : "$";
      return `${sym}${fmt(val)}`;
    }).join(" / ");
  const fmtTotalPnL = () =>
    totalCurrencies.map(c => {
      const s = totalsByCur[c];
      const sym = c === "CAD" ? "C$" : "$";
      return `${s.pnl >= 0 ? "+" : ""}${sym}${fmt(Math.abs(s.pnl))}`;
    }).join(" / ");
  const fmtTotalPnLPct = () =>
    totalCurrencies.map(c => {
      const s = totalsByCur[c];
      const pct = s.cost > 0 ? (s.pnl / s.cost) * 100 : 0;
      return fmtPct(pct);
    }).join(" / ");
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices, holdings]);

  const selectedRow = sortedRows.find((r) => r.holding.id === selectedRowId) ?? null;

  return (
    <div>
      <div>
        {!readOnly && (
          <div className="flex items-center justify-end mb-3">
            <AddHoldingDialog portfolioId={portfolioId} onAdd={refresh} />
          </div>
        )}
        {rows.length === 0 ? (
          <div className="text-muted-foreground text-xs py-8 text-center border border-dashed border-border">
            NO POSITIONS — ADD A STOCK TO BEGIN
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                  <th className="text-right w-20 hidden sm:table-cell cursor-pointer select-none hover:text-accent transition-colors" onClick={() => cycleSort("day")}>DAY{si("day")}</th>
                  <th
                    className="text-right w-28 cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => { setMktMode(m => m === "mkt" ? "cost" : "mkt"); cycleSort("mkt"); }}
                    title="Click to sort / toggle MKT VALUE / COST BASIS"
                  >
                    {mktMode === "mkt" ? "MKT" : "COST"}{si("mkt") || " ▾"}
                  </th>
                  <th
                    className="text-right w-16 cursor-pointer select-none hover:text-accent transition-colors"
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
                  const cur = row.holding.currency === "CAD" ? "C$" : "$";
                  const weight = totalMarketValue > 0 ? (row.marketValue / totalMarketValue) * 100 : 0;
                  return (
                    <tr
                      key={row.holding.id}
                      className={`cursor-pointer ${selectedRowId === row.holding.id ? "bg-border/30" : ""}`}
                      onClick={() => selectRow(row.holding.id)}
                    >
                      <td className="font-medium text-accent">{row.holding.ticker}</td>
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
                          ? (row.price ? `${cur}${fmt(row.price.price)}` : "—")
                          : (row.avgCost > 0 ? `${cur}${fmt(row.avgCost)}` : "—")}
                      </td>
                      <td className={`text-right tabular-nums hidden sm:table-cell ${row.price ? (row.price.changePercent >= 0 ? "text-positive" : "text-negative") : ""}`}>
                        {row.price ? fmtPct(row.price.changePercent) : "—"}
                      </td>
                      <td className="text-right tabular-nums">
                        {mktMode === "mkt"
                          ? (row.marketValue > 0 ? `${cur}${fmt(row.marketValue)}` : "—")
                          : (row.costBasis > 0 ? `${cur}${fmt(row.costBasis)}` : "—")}
                      </td>
                      <td className="text-right tabular-nums text-muted-foreground">
                        {wgtMode === "pct"
                          ? (totalMarketValue > 0 ? `${weight.toFixed(1)}%` : "—")
                          : (() => {
                              const alloc = allocMap[row.holding.ticker] ?? 0;
                              return `${cur}${fmt(alloc)}`;
                            })()}
                      </td>
                      <td className={`text-right tabular-nums ${row.unrealizedPnL >= 0 ? "text-positive" : "text-negative"}`}>
                        {row.marketValue > 0 ? (
                          colMode === "usd"
                            ? `${row.unrealizedPnL >= 0 ? "+" : ""}${cur}${fmt(Math.abs(row.unrealizedPnL))}`
                            : fmtPct(row.unrealizedPnLPct)
                        ) : "—"}
                      </td>
                      <td className={`hidden sm:table-cell text-right tabular-nums ${
                        w52Mode === "high"
                          ? (row.price && row.price.fromHighPct < -10 ? "text-negative" : "text-muted-foreground")
                          : (row.price && row.price.fromLowPct > 30 ? "text-positive" : "text-muted-foreground")
                      }`}>
                        {w52Mode === "high"
                          ? (row.price?.week52High ? `${cur}${fmt(row.price.week52High)} (${fmtPct(row.price.fromHighPct)})` : "—")
                          : (row.price?.week52Low ? `${cur}${fmt(row.price.week52Low)} (${fmtPct(row.price.fromLowPct)})` : "—")}
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
                    <td />
                    <td className={`text-right tabular-nums font-medium text-xs ${totalPnLPositive ? "text-positive" : "text-negative"}`}>
                      {colMode === "usd" ? fmtTotalPnL() : fmtTotalPnLPct()}
                    </td>
                    <td className="hidden sm:table-cell" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
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
        />
      )}
    </div>
  );
}

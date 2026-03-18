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
    const portfolio = all.find((p: any) => p.id === portfolioId);
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

  const selectedRow = rows.find((r) => r.holding.id === selectedRowId) ?? null;

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
                  <th className="w-20">TICKER</th>
                  <th className="text-left w-32 hidden lg:table-cell">NAME</th>
                  <th className="text-right w-24">SHARES</th>
                  <th
                    className="text-right w-24 cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => setPriceMode(m => m === "price" ? "avg" : "price")}
                    title="Click to toggle PRICE / AVG COST"
                  >
                    {priceMode === "price" ? "PRICE" : "AVG"} ▾
                  </th>
                  <th className="text-right w-20 hidden sm:table-cell">DAY</th>
                  <th
                    className="text-right w-28 cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => setMktMode(m => m === "mkt" ? "cost" : "mkt")}
                    title="Click to toggle MKT VALUE / COST BASIS"
                  >
                    {mktMode === "mkt" ? "MKT" : "COST"} ▾
                  </th>
                  <th
                    className="text-right w-16 cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => setWgtMode(m => m === "pct" ? "alloc" : "pct")}
                    title="Click to toggle WEIGHT / ALLOCATION"
                  >
                    {wgtMode === "pct" ? "WGT" : "ALLOC"} ▾
                  </th>
                  <th
                    className="text-right w-28 cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={cycleColMode}
                    title="Click to toggle P&L $ / P&L %"
                  >
                    {colMode === "usd" ? "P&L $" : "P&L %"} ▾
                  </th>
                  <th
                    className="text-right w-24 cursor-pointer select-none hover:text-accent transition-colors"
                    onClick={() => setW52Mode(m => m === "high" ? "low" : "high")}
                    title="Click to toggle 52W HIGH / LOW"
                  >
                    {w52Mode === "high" ? "52W H" : "52W L"} ▾
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
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
                        {fmt(row.shares, 4)}
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
                      <td className={`text-right tabular-nums ${
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

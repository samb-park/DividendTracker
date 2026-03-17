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
}: {
  portfolioId: string;
  initialHoldings: Holding[];
  onHoldingsChange: (rows: Array<{ ticker: string; name?: string | null; marketValue: number; costBasis: number; unrealizedPnL: number; unrealizedPnLPct: number; dayChange: number; currency: "USD" | "CAD" }>) => void;
  onDetailOpen?: (open: boolean) => void;
  readOnly?: boolean;
}) {
  const [holdings, setHoldings] = useState(initialHoldings);
  const [prices, setPrices] = useState<Record<string, PriceData | null>>({});
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [colMode, setColMode] = useState<"usd" | "pct" | "weight">("usd");

  const cycleColMode = () =>
    setColMode(m => m === "usd" ? "pct" : m === "pct" ? "weight" : "usd");

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

  useEffect(() => {
    onHoldingsChange(
      rows.map((r) => ({
        ticker: r.holding.ticker,
        marketValue: r.marketValue,
        costBasis: r.costBasis,
        unrealizedPnL: r.unrealizedPnL,
        unrealizedPnLPct: r.unrealizedPnLPct,
        dayChange: r.price ? r.price.change * r.shares : 0,
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
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">{rows.length} POSITIONS</span>
          {!readOnly && <AddHoldingDialog portfolioId={portfolioId} onAdd={refresh} />}
        </div>
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
                  <th className="text-right w-24">SHARES</th>
                  <th className="text-right w-24">PRICE</th>
                  <th className="text-right w-20">DAY</th>
                  <th className="text-right w-28">MKT</th>
                  <th
                    className="text-right w-28 cursor-pointer select-none"
                    onClick={cycleColMode}
                    title="Click to toggle"
                  >
                    {colMode === "usd" ? "P&L $" : colMode === "pct" ? "P&L %" : "WEIGHT"} ▾
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
                      <td className="text-right tabular-nums">{fmt(row.shares, 4)}</td>
                      <td className="text-right tabular-nums">
                        {loadingPrices ? (
                          <span className="text-muted-foreground">...</span>
                        ) : row.price ? `${cur}${fmt(row.price.price)}` : "—"}
                      </td>
                      <td className={`text-right tabular-nums ${row.price ? (row.price.changePercent >= 0 ? "text-positive" : "text-negative") : ""}`}>
                        {row.price ? fmtPct(row.price.changePercent) : "—"}
                      </td>
                      <td className="text-right tabular-nums">
                        {row.marketValue > 0 ? `${cur}${fmt(row.marketValue)}` : "—"}
                      </td>
                      <td className={`text-right tabular-nums ${colMode !== "weight" ? (row.unrealizedPnL >= 0 ? "text-positive" : "text-negative") : "text-muted-foreground"}`}>
                        {row.marketValue > 0 ? (
                          colMode === "usd"
                            ? `${row.unrealizedPnL >= 0 ? "+" : ""}${cur}${fmt(Math.abs(row.unrealizedPnL))}`
                            : colMode === "pct"
                            ? fmtPct(row.unrealizedPnLPct)
                            : `${weight.toFixed(1)}%`
                        ) : "—"}
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
        />
      )}
    </div>
  );
}

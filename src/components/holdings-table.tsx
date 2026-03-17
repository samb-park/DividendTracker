"use client";

import { useState, useEffect, useCallback } from "react";
import { AddTransactionDialog } from "./add-transaction-dialog";
import { AddHoldingDialog } from "./add-holding-dialog";

interface Transaction {
  id: string;
  action: "BUY" | "SELL";
  quantity: string;
  price: string;
  commission: string;
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
}

interface HoldingRow {
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
  // Use Questrade openQuantity if available; otherwise sum transactions
  const shares = holding.quantity != null
    ? parseFloat(holding.quantity)
    : totalBought - totalSold;
  // Use Questrade averageEntryPrice if available; otherwise derive from transactions
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
}: {
  portfolioId: string;
  initialHoldings: Holding[];
  onHoldingsChange: (rows: Array<{ ticker: string; marketValue: number; unrealizedPnL: number; unrealizedPnLPct: number; currency: "USD" | "CAD" }>) => void;
}) {
  const [holdings, setHoldings] = useState(initialHoldings);
  const [prices, setPrices] = useState<Record<string, PriceData | null>>({});
  const [loadingPrices, setLoadingPrices] = useState(true);

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
    .filter((r) => r.shares > 0);

  useEffect(() => {
    onHoldingsChange(
      rows.map((r) => ({
        ticker: r.holding.ticker,
        marketValue: r.marketValue,
        unrealizedPnL: r.unrealizedPnL,
        unrealizedPnLPct: r.unrealizedPnLPct,
        name: r.holding.name,
        currency: r.holding.currency,
      }))
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices, holdings]);

  const deleteHolding = async (id: string) => {
    if (!confirm("Delete this holding and all its transactions?")) return;
    await fetch(`/api/holdings/${id}`, { method: "DELETE" });
    await refresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{rows.length} POSITIONS</span>
        <AddHoldingDialog portfolioId={portfolioId} onAdd={refresh} />
      </div>
      {rows.length === 0 ? (
        <div className="text-muted-foreground text-xs py-8 text-center border border-dashed border-border">
          NO POSITIONS — ADD A STOCK TO BEGIN
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>TICKER</th>
                <th>NAME</th>
                <th className="text-right">SHARES</th>
                <th className="text-right">AVG COST</th>
                <th className="text-right">PRICE</th>
                <th className="text-right">DAY</th>
                <th className="text-right">MKT VALUE</th>
                <th className="text-right">P&amp;L</th>
                <th className="text-right">52W HIGH</th>
                <th className="text-right">FROM HIGH</th>
                <th className="text-right">52W LOW</th>
                <th className="text-right">FROM LOW</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.holding.id}>
                  <td className="font-medium text-accent">{row.holding.ticker}</td>
                  <td className="text-muted-foreground text-xs max-w-32 truncate">{row.holding.name || "—"}</td>
                  <td className="text-right tabular-nums">{fmt(row.shares, 4)}</td>
                  <td className="text-right tabular-nums">{row.holding.currency === "CAD" ? "C$" : "$"}{fmt(row.avgCost)}</td>
                  <td className="text-right tabular-nums">
                    {loadingPrices ? (
                      <span className="text-muted-foreground">...</span>
                    ) : row.price ? (
                      `${row.holding.currency === "CAD" ? "C$" : "$"}${fmt(row.price.price)}`
                    ) : "—"}
                  </td>
                  <td className={`text-right tabular-nums ${row.price ? (row.price.changePercent >= 0 ? "text-positive" : "text-negative") : ""}`}>
                    {row.price ? fmtPct(row.price.changePercent) : "—"}
                  </td>
                  <td className="text-right tabular-nums">
                    {row.marketValue > 0 ? `${row.holding.currency === "CAD" ? "C$" : "$"}${fmt(row.marketValue)}` : "—"}
                  </td>
                  <td className={`text-right tabular-nums ${row.unrealizedPnL >= 0 ? "text-positive" : "text-negative"}`}>
                    {row.marketValue > 0 ? (
                      <>
                        {row.unrealizedPnL >= 0 ? "+" : ""}${fmt(Math.abs(row.unrealizedPnL))}
                        <br />
                        <span className="text-xs">{fmtPct(row.unrealizedPnLPct)}</span>
                      </>
                    ) : "—"}
                  </td>
                  <td className="text-right tabular-nums text-muted-foreground">
                    {row.price?.week52High ? `$${fmt(row.price.week52High)}` : "—"}
                  </td>
                  <td className={`text-right tabular-nums ${row.price && row.price.fromHighPct < -10 ? "text-negative" : "text-muted-foreground"}`}>
                    {row.price?.fromHighPct !== undefined ? fmtPct(row.price.fromHighPct) : "—"}
                  </td>
                  <td className="text-right tabular-nums text-muted-foreground">
                    {row.price?.week52Low ? `$${fmt(row.price.week52Low)}` : "—"}
                  </td>
                  <td className={`text-right tabular-nums ${row.price && row.price.fromLowPct > 20 ? "text-positive" : "text-muted-foreground"}`}>
                    {row.price?.fromLowPct !== undefined ? fmtPct(row.price.fromLowPct) : "—"}
                  </td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <AddTransactionDialog
                        holdingId={row.holding.id}
                        ticker={row.holding.ticker}
                        onAdd={refresh}
                      />
                      <button
                        className="btn-retro text-xs text-negative border-negative/30 hover:border-negative"
                        onClick={() => deleteHolding(row.holding.id)}
                      >
                        [X]
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

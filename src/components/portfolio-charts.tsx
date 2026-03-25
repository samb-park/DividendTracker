"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  type TooltipProps,
} from "recharts";
import { fmt } from "@/lib/utils";
import { RETRO_TOOLTIP_STYLE } from "@/lib/chart-tokens";

interface HoldingData {
  ticker: string;
  name?: string | null;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  currency: "USD" | "CAD";
}

interface Transaction {
  id: string;
  action: "BUY" | "SELL" | "DIVIDEND";
  quantity: string;
  price: string;
  commission: string;
  date: string;
}

interface HoldingWithTxn {
  id: string;
  ticker: string;
  name: string | null;
  currency: "USD" | "CAD";
  quantity: string | null;
  avgCost: string | null;
  transactions: Transaction[];
}


const RANGES = ["1M", "3M", "6M", "1Y", "ALL"] as const;

interface EquityPoint {
  date: string;
  value: number;
  cost: number;
}

interface CustomTooltipProps extends TooltipProps<number, string> {
  currencySymbol?: string;
}

function CustomTooltip({ active, payload, label, currencySymbol }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload.find((p) => p.dataKey === "value")?.value ?? 0;
  const cost = payload.find((p) => p.dataKey === "cost")?.value ?? 0;
  const sym = currencySymbol ?? "$";
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  return (
    <div style={RETRO_TOOLTIP_STYLE} className="p-2">
      <div style={{ color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>{label}</div>
      <div>Value: <span style={{ color: "hsl(var(--positive))" }}>{sym}{fmt(value)}</span></div>
      <div>Cost: <span style={{ color: "hsl(var(--muted-foreground))" }}>{sym}{fmt(cost)}</span></div>
      <div style={{ borderTop: "1px solid hsl(var(--border))", marginTop: 4, paddingTop: 4, color: pnl >= 0 ? "hsl(var(--positive))" : "hsl(var(--negative))" }}>
        P&L: {pnl >= 0 ? "+" : ""}{sym}{fmt(Math.abs(pnl))} ({pnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
      </div>
    </div>
  );
}

function useChartHeight(mobile: number, desktop: number) {
  const [h, setH] = useState(desktop);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const update = () => setH(mql.matches ? desktop : mobile);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [mobile, desktop]);
  return h;
}

export function PortfolioCharts({
  holdings,
  holdingsWithTransactions,
  fxRate,
  totalCashCAD = 0,
  displayCurrency = "CAD",
}: {
  holdings: HoldingData[];
  holdingsWithTransactions?: HoldingWithTxn[];
  fxRate?: number;
  totalCashCAD?: number;
  displayCurrency?: "CAD" | "USD";
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("3M");
  const [rangeDropdownOpen, setRangeDropdownOpen] = useState(false);
  const rangeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rangeDropdownRef.current && !rangeDropdownRef.current.contains(e.target as Node)) {
        setRangeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const [equityData, setEquityData] = useState<EquityPoint[]>([]);
  const [loadingPnl, setLoadingPnl] = useState(false);
  const [equityError, setEquityError] = useState(false);
  const lineChartHeight = useChartHeight(160, 220);
  const currencySymbol = displayCurrency === "CAD" ? "C$" : "$";

  const fetchEquityData = useCallback(async () => {
    if (!holdingsWithTransactions || holdingsWithTransactions.length === 0) return;
    setLoadingPnl(true);
    setEquityError(false);

    const fx = fxRate ?? 1;

    // For ALL, find the earliest BUY transaction date across all holdings
    let queryParam: string;
    if (range === "ALL") {
      const earliest = holdingsWithTransactions
        .flatMap(h => h.transactions.filter(t => t.action === "BUY"))
        .map(t => t.date?.slice(0, 10) ?? "")
        .filter(Boolean)
        .sort()[0];
      queryParam = earliest ? `from=${earliest}` : `range=1y`;
    } else {
      queryParam = `range=${range.toLowerCase()}`;
    }

    // Fetch historical prices via single batch request + cash transactions in parallel
    const histories: Record<string, { date: string; close: number }[]> = {};
    let cashTxns: { date: string; action: "DEPOSIT" | "WITHDRAWAL"; amount: number; currency: "CAD" | "USD" }[] = [];
    let successCount = 0;
    const tickers = holdingsWithTransactions.map((h) => h.ticker);

    await Promise.all([
      fetch("/api/price/history/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          queryParam.startsWith("range=")
            ? { tickers, range: queryParam.slice(6) }
            : { tickers, from: queryParam.slice(5) }
        ),
      })
        .then((r) => r.ok ? r.json() : {})
        .then((d: Record<string, { date: string; close: number }[]>) => {
          for (const [ticker, hist] of Object.entries(d)) {
            if (hist.length > 0) { histories[ticker] = hist; successCount++; }
          }
        })
        .catch(() => {}),
      fetch("/api/cash-transactions?all=true")
        .then((r) => r.ok ? r.json() : { items: [] })
        .then((d) => { cashTxns = d.items ?? []; })
        .catch(() => {}),
    ]);

    // Collect all chart dates
    const dateSet = new Set<string>();
    for (const hist of Object.values(histories)) {
      for (const point of hist) {
        dateSet.add(point.date);
      }
    }
    const dates = Array.from(dateSet).sort();

    const result = dates.map((date) => {
      let totalValue = 0;
      let totalCost = 0;

      // Reconstruct cash at this date.
      // Only undo SELL transactions (removes post-sell proceeds so pre-sell dates don't dip)
      // and DEPOSIT/WITHDRAWAL (reflects actual cash balance at that time).
      // Do NOT undo BUY transactions: deposit history may be incomplete (sync only covers
      // last year), so undoing buys without matching deposits inflates historical cash.
      let cashAtDate = totalCashCAD;

      for (const h of holdingsWithTransactions) {
        const hist = histories[h.ticker];
        const currencyMult = h.currency === "USD" ? fx : 1;
        const currentQty = h.quantity != null ? parseFloat(h.quantity) : 0;
        const avgCost = h.avgCost != null ? parseFloat(h.avgCost) : 0;
        const txns = h.transactions;

        let sharesAtDate = currentQty;
        if (txns && txns.length > 0) {
          for (const txn of txns) {
            const txnDate = txn.date ? txn.date.slice(0, 10) : "";
            if (txnDate > date) {
              const qty = parseFloat(txn.quantity);
              const price = parseFloat(txn.price);
              const commission = parseFloat(txn.commission ?? "0");
              if (txn.action === "BUY") {
                sharesAtDate -= qty;
                // Do NOT restore cash for buys (incomplete deposit history would inflate)
              } else if (txn.action === "SELL") {
                sharesAtDate += qty;
                cashAtDate -= (qty * price - commission) * currencyMult; // undo sell: remove proceeds
              }
            }
          }
        }
        if (sharesAtDate < 0) sharesAtDate = 0;

        if (!hist) continue;
        const point = hist.filter((p) => p.date <= date).pop();
        if (!point) continue;

        totalValue += sharesAtDate * point.close * currencyMult;
        totalCost += sharesAtDate * avgCost * currencyMult;
      }

      // Undo post-date deposits/withdrawals so cash reflects pre-deposit balance
      for (const ct of cashTxns) {
        if (ct.date > date) {
          const mult = ct.currency === "USD" ? fx : 1;
          if (ct.action === "DEPOSIT") {
            cashAtDate -= ct.amount * mult; // before this deposit, less cash
          } else {
            cashAtDate += ct.amount * mult; // before this withdrawal, more cash
          }
        }
      }
      if (cashAtDate < 0) cashAtDate = 0;

      return {
        date,
        value: Math.round((totalValue + cashAtDate) * 100) / 100,
        cost: Math.round(totalCost * 100) / 100,
      };
    });

    if (holdingsWithTransactions.length > 0 && successCount === 0) {
      setEquityError(true);
    }
    setEquityData(result);
    setLoadingPnl(false);
  }, [holdingsWithTransactions, fxRate, range]);

  useEffect(() => {
    fetchEquityData();
  }, [fetchEquityData]);

  if (holdings.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Total Equity Chart */}
      {holdingsWithTransactions && holdingsWithTransactions.length > 0 && (
        <div className="border border-border p-4 bg-card">
          <div className="flex items-center justify-between mb-4">
            <div className="text-accent text-xs tracking-wide">&#9654; TOTAL EQUITY</div>
            <div className="relative" ref={rangeDropdownRef}>
              <button
                className="btn-retro btn-retro-primary text-[10px] px-2 py-0.5 flex items-center gap-1.5 min-w-[4rem]"
                onClick={() => setRangeDropdownOpen((v) => !v)}
              >
                <span className="flex-1 text-left">{range}</span>
                <span className="text-muted-foreground">▾</span>
              </button>
              {rangeDropdownOpen && (
                <div className="absolute top-full right-0 mt-0.5 z-50 bg-card border border-border min-w-full">
                  {RANGES.map((r) => (
                    <button
                      key={r}
                      className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-border/30 ${range === r ? "text-accent" : ""}`}
                      onClick={() => { setRange(r); setRangeDropdownOpen(false); }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {loadingPnl ? (
            <div className="text-muted-foreground text-xs text-center py-8">LOADING...</div>
          ) : equityError ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-2 border border-dashed border-border text-xs">
              <span className="text-negative">FAILED TO LOAD PRICE HISTORY</span>
              <button className="btn-retro text-[10px] px-3 py-1" onClick={() => { setEquityError(false); fetchEquityData(); }}>RETRY</button>
            </div>
          ) : equityData.length > 0 ? (
            <>
            <div className="chart-touch-zone">
              <ResponsiveContainer width="100%" height={lineChartHeight}>
                <LineChart data={equityData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip content={<CustomTooltip currencySymbol={currencySymbol} />} />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                    dot={false}
                    activeDot={{ r: 2, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(142, 69%, 58%)"
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3, fill: "hsl(142, 69%, 58%)" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2 ml-1">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span style={{ display: "inline-block", width: 16, height: 0, borderTop: "2px solid hsl(142,69%,58%)" }} />
                TOTAL VALUE
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span style={{ display: "inline-block", width: 16, height: 0, borderTop: "2px dashed hsl(var(--border))" }} />
                COST BASIS
              </div>
            </div>
            </>
          ) : (
            <div className="text-muted-foreground text-xs text-center py-8">NO DATA</div>
          )}
        </div>
      )}

    </div>
  );
}

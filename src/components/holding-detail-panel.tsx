"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { AddTransactionDialog } from "./add-transaction-dialog";
import { X } from "lucide-react";

interface Transaction {
  id: string;
  action: "BUY" | "SELL" | "DIVIDEND";
  quantity: string;
  price: string;
  commission: string;
  date?: string;
  notes?: string | null;
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

interface HoldingRow {
  holding: {
    id: string;
    ticker: string;
    name: string | null;
    currency: "USD" | "CAD";
    quantity: string | null;
    avgCost: string | null;
    transactions: Transaction[];
  };
  shares: number;
  avgCost: number;
  costBasis: number;
  price: PriceData | null;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

type DetailTab = "transactions" | "dividends";

interface InvestmentSettings {
  contribution: { frequency: "weekly" | "biweekly" | "monthly"; amount: number; currency: "USD" | "CAD" } | null;
  target: { pct: number } | null;
}

function convertCurrency(amount: number, from: "USD" | "CAD", to: "USD" | "CAD", fxRate: number) {
  if (from === to) return amount;
  return from === "USD" ? amount * fxRate : amount / fxRate;
}

export function HoldingDetailPanel({
  row,
  readOnly,
  onClose,
  onRefresh,
  totalMarketValue = 0,
}: {
  row: HoldingRow;
  readOnly: boolean;
  onClose: () => void;
  onRefresh: () => void;
  totalMarketValue?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("transactions");
  const [investPlan, setInvestPlan] = useState<InvestmentSettings | null>(null);
  const [fxRate, setFxRate] = useState(1.35);
  const [displayCur, setDisplayCur] = useState<"USD" | "CAD">(row.holding.currency);

  const today = new Date().toISOString().split("T")[0];
  const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(oneYearAgo);
  const [dateTo, setDateTo] = useState(today);

  // Derived display helpers
  const sym = displayCur === "CAD" ? "C$" : "$";
  const toDisp = (amount: number) => convertCurrency(amount, row.holding.currency, displayCur, fxRate);

  const buysSells = useMemo(() =>
    row.holding.transactions.filter((t) => t.action !== "DIVIDEND"),
    [row.holding.transactions]
  );

  const dividendTxns = useMemo(() =>
    row.holding.transactions.filter((t) => t.action === "DIVIDEND"),
    [row.holding.transactions]
  );

  const filterByDate = (txns: Transaction[]) =>
    txns.filter((txn) => {
      const d = txn.date?.slice(0, 10) ?? "";
      if (!d) return true;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });

  const filteredTxns = useMemo(() => filterByDate(buysSells), [buysSells, dateFrom, dateTo]);
  const filteredDivs = useMemo(() => filterByDate(dividendTxns), [dividendTxns, dateFrom, dateTo]);

  const totalDivsReceived = useMemo(() =>
    filteredDivs.reduce((s, t) => s + parseFloat(t.price), 0),
    [filteredDivs]
  );

  const totalDivsAllTime = useMemo(() =>
    dividendTxns.reduce((s, t) => s + parseFloat(t.price), 0),
    [dividendTxns]
  );

  const actualDivs12m = useMemo(() => {
    const cutoff = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
    return dividendTxns
      .filter((t) => (t.date?.slice(0, 10) ?? "") >= cutoff)
      .reduce((s, t) => s + parseFloat(t.price), 0);
  }, [dividendTxns]);

  const actualYieldOnCost = row.costBasis > 0 && actualDivs12m > 0
    ? (actualDivs12m / row.costBasis) * 100
    : null;

  const actualYield = row.marketValue > 0 && actualDivs12m > 0
    ? (actualDivs12m / row.marketValue) * 100
    : null;

  // Show total return when either price is available or dividends received
  const hasReturn = row.marketValue > 0 || totalDivsAllTime > 0;
  const totalReturn = hasReturn && row.costBasis > 0
    ? (row.marketValue > 0 ? row.marketValue - row.costBasis : 0) + totalDivsAllTime
    : null;
  const totalReturnPct = totalReturn != null && row.costBasis > 0
    ? (totalReturn / row.costBasis) * 100
    : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!readOnly) return;
    Promise.all([
      fetch("/api/settings/investment").then(r => r.json()),
      fetch("/api/fx").then(r => r.json()),
    ]).then(([inv, fx]) => {
      setInvestPlan({
        contribution: inv.contribution ?? null,
        target: inv.targets?.[row.holding.ticker] ?? null,
      });
      if (fx.rate) setFxRate(fx.rate);
    });
  }, [readOnly, row.holding.ticker]);

  const p = row.price;

  const deleteHolding = async () => {
    if (!confirm("Delete this holding and all its transactions?")) return;
    await fetch(`/api/holdings/${row.holding.id}`, { method: "DELETE" });
    onRefresh();
    onClose();
  };

  const CurrencyToggle = () => (
    <div className="flex gap-1">
      {(["USD", "CAD"] as const).map(c => (
        <button key={c} onClick={() => setDisplayCur(c)}
          className={`btn-retro text-[10px] ${displayCur === c ? "btn-retro-primary" : ""}`}>
          [{c}]
        </button>
      ))}
    </div>
  );

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 md:inset-auto md:top-0 md:right-0 md:h-full md:w-[28rem] lg:w-[32rem] xl:w-1/2 bg-background md:border-l border-border z-50 overflow-y-auto"
    >
      {/* Mobile header */}
      <div className="flex items-center justify-between p-3 border-b border-border md:hidden">
        <span className="text-xs text-muted-foreground tracking-widest">DETAIL</span>
        <div className="flex items-center gap-2">
          <CurrencyToggle />
          <button className="btn-retro p-1" onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="text-accent text-lg font-medium">{row.holding.ticker}</div>
            <div className="text-muted-foreground text-xs">{row.holding.name || "—"}</div>
          </div>
          <div className="flex items-center gap-2">
            <CurrencyToggle />
            <button className="btn-retro p-1 hidden md:block" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Price info */}
        <div className="border border-border bg-card p-4 mb-4">
          <div className="text-xs text-muted-foreground tracking-widest mb-2">PRICE</div>
          {p ? (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-xl font-medium tabular-nums">{sym}{fmt(toDisp(p.price))}</span>
                <span className={`text-sm tabular-nums ${p.changePercent >= 0 ? "text-positive" : "text-negative"}`}>
                  {fmtPct(p.changePercent)}
                </span>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>52W H: {sym}{fmt(toDisp(p.week52High))} ({fmtPct(p.fromHighPct)})</span>
                <span>52W L: {sym}{fmt(toDisp(p.week52Low))} ({fmtPct(p.fromLowPct)})</span>
              </div>
            </>
          ) : (
            <div className="text-muted-foreground text-xs">LOADING PRICE DATA...</div>
          )}
        </div>

        {/* Position summary */}
        <div className="border border-border bg-card p-4 mb-4">
          <div className="text-xs text-muted-foreground tracking-widest mb-2">POSITION</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">SHARES</div>
              <div className="tabular-nums">{fmt(row.shares, 4)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">WEIGHT</div>
              <div className="tabular-nums">
                {totalMarketValue > 0 ? `${((row.marketValue / totalMarketValue) * 100).toFixed(1)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">AVG COST</div>
              <div className="tabular-nums">{sym}{fmt(toDisp(row.avgCost))}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">DAY</div>
              <div className={`tabular-nums ${p ? (p.changePercent >= 0 ? "text-positive" : "text-negative") : ""}`}>
                {p ? `${p.changePercent >= 0 ? "+" : ""}${sym}${fmt(toDisp(p.change * row.shares))} (${p.changePercent >= 0 ? "+" : ""}${p.changePercent.toFixed(2)}%)` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">COST BASIS</div>
              <div className="tabular-nums">{sym}{fmt(toDisp(row.costBasis))}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">MKT VALUE</div>
              <div className="tabular-nums">{row.marketValue > 0 ? `${sym}${fmt(toDisp(row.marketValue))}` : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">DIV YIELD</div>
              <div className="tabular-nums">
                {p?.dividendYield != null ? `${p.dividendYield.toFixed(2)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">TOTAL DIVS</div>
              <div className={`tabular-nums ${totalDivsAllTime > 0 ? "text-primary" : "text-muted-foreground"}`}>
                {totalDivsAllTime > 0 ? `${sym}${fmt(toDisp(totalDivsAllTime))}` : "—"}
              </div>
            </div>
            {actualDivs12m > 0 && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground">12M DIVS</div>
                  <div className="tabular-nums">{sym}{fmt(toDisp(actualDivs12m))}</div>
                </div>
                {actualYield != null && (
                  <div>
                    <div className="text-xs text-muted-foreground">ACTUAL YIELD</div>
                    <div className="tabular-nums">{actualYield.toFixed(2)}%</div>
                  </div>
                )}
                {actualYieldOnCost != null && (
                  <div>
                    <div className="text-xs text-muted-foreground">YIELD ON COST</div>
                    <div className="tabular-nums">{actualYieldOnCost.toFixed(2)}%</div>
                  </div>
                )}
              </>
            )}
            {totalReturn != null && (
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">TOTAL RETURN</div>
                <div className={`tabular-nums ${totalReturn >= 0 ? "text-positive" : "text-negative"}`}>
                  {totalReturn >= 0 ? "+" : ""}{sym}{fmt(Math.abs(toDisp(totalReturn)))}
                  {totalReturnPct != null && ` (${totalReturn >= 0 ? "+" : ""}${totalReturnPct.toFixed(2)}%)`}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Investment Plan */}
        {readOnly && investPlan && investPlan.target && (
          <div className="border border-border bg-card p-4 mb-4">
            <div className="text-xs text-muted-foreground tracking-widest mb-3">INVESTMENT PLAN</div>
            {(() => {
              const currentPct = totalMarketValue > 0 ? (row.marketValue / totalMarketValue) * 100 : 0;
              const targetPct = investPlan.target!.pct;
              const gapPct = Math.max(0, targetPct - currentPct);
              const reached = gapPct < 0.01;
              const gapNative = totalMarketValue > 0 ? (gapPct / 100) * totalMarketValue : 0;
              const gapDisplay = convertCurrency(gapNative, row.holding.currency, displayCur, fxRate);
              const FREQ_LABEL = { weekly: "WK", biweekly: "BW", monthly: "MO" } as const;

              return (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">TARGET</div>
                    <div className="tabular-nums">{targetPct.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">CURRENT</div>
                    <div className="tabular-nums">{currentPct.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">GAP</div>
                    {reached ? (
                      <div className="tabular-nums text-positive">✓ REACHED</div>
                    ) : (
                      <div className="tabular-nums">-{gapPct.toFixed(1)}% ({sym}{fmt(gapDisplay)})</div>
                    )}
                  </div>
                  {!reached && investPlan.contribution && (() => {
                    const contribDisplay = convertCurrency(
                      investPlan.contribution.amount,
                      investPlan.contribution.currency,
                      displayCur, fxRate
                    );
                    const periods = Math.ceil(gapDisplay / contribDisplay);
                    const fl = FREQ_LABEL[investPlan.contribution.frequency];
                    return (
                      <div>
                        <div className="text-xs text-muted-foreground">TO FILL GAP</div>
                        <div className="tabular-nums text-primary">
                          {periods} {fl} ({sym}{fmt(contribDisplay)}/{fl})
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-2 mb-4">
          <button
            className={`btn-retro text-xs ${activeTab === "transactions" ? "btn-retro-primary" : ""}`}
            onClick={() => setActiveTab("transactions")}
          >
            [TRANSACTIONS]
          </button>
          <button
            className={`btn-retro text-xs ${activeTab === "dividends" ? "btn-retro-primary" : ""}`}
            onClick={() => setActiveTab("dividends")}
          >
            [DIVIDENDS]
          </button>
        </div>

        {/* Transactions tab */}
        {activeTab === "transactions" && (
          <div className="border border-border bg-card p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-muted-foreground tracking-widest">
                TRANSACTIONS ({filteredTxns.length}/{buysSells.length})
              </div>
              {!readOnly && (
                <AddTransactionDialog
                  holdingId={row.holding.id}
                  ticker={row.holding.ticker}
                  onAdd={onRefresh}
                />
              )}
            </div>
            {buysSells.length > 0 && (
              <div className="flex items-center gap-2 mb-3 text-[10px]">
                <span className="text-muted-foreground">FROM</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="!w-auto !p-1 !text-[10px] tabular-nums"
                />
                <span className="text-muted-foreground">TO</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="!w-auto !p-1 !text-[10px] tabular-nums"
                />
              </div>
            )}
            {filteredTxns.length === 0 ? (
              <div className="text-muted-foreground text-xs text-center py-4">NO TRANSACTIONS</div>
            ) : (
              <div className="space-y-2">
                {filteredTxns.map((txn) => (
                  <div key={txn.id} className="flex items-center justify-between text-xs border-b border-border pb-2 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={txn.action === "BUY" ? "text-positive" : "text-negative"}>
                        {txn.action}
                      </span>
                      <span className="tabular-nums">{parseFloat(txn.quantity).toFixed(4)}</span>
                      <span className="text-muted-foreground">@</span>
                      <span className="tabular-nums">{sym}{fmt(toDisp(parseFloat(txn.price)))}</span>
                    </div>
                    <div className="text-muted-foreground tabular-nums">
                      {sym}{fmt(toDisp(parseFloat(txn.quantity) * parseFloat(txn.price)))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dividends tab */}
        {activeTab === "dividends" && (
          <>
            <div className="border border-border bg-card p-4 mb-4">
              <div className="text-xs text-muted-foreground tracking-widest mb-3">
                RECEIVED ({filteredDivs.length}/{dividendTxns.length})
              </div>
              {dividendTxns.length > 0 && (
                <div className="flex items-center gap-2 mb-3 text-[10px]">
                  <span className="text-muted-foreground">FROM</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="!w-auto !p-1 !text-[10px] tabular-nums"
                  />
                  <span className="text-muted-foreground">TO</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="!w-auto !p-1 !text-[10px] tabular-nums"
                  />
                </div>
              )}
              {filteredDivs.length > 0 && (
                <div className="flex items-center justify-between text-xs mb-3 p-2 border border-primary/30 bg-primary/5">
                  <span className="text-muted-foreground">TOTAL RECEIVED</span>
                  <span className="tabular-nums text-primary font-medium">{sym}{fmt(toDisp(totalDivsReceived))}</span>
                </div>
              )}
              {filteredDivs.length === 0 ? (
                <div className="text-muted-foreground text-xs text-center py-4">
                  {dividendTxns.length === 0 ? "NO DIVIDEND HISTORY — SYNC FROM QUESTRADE" : "NO DIVIDENDS IN DATE RANGE"}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredDivs.map((txn) => (
                    <div key={txn.id} className="flex items-center justify-between text-xs border-b border-border pb-2 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-primary">DIV</span>
                        <span className="text-muted-foreground tabular-nums">{txn.date?.slice(0, 10) ?? "—"}</span>
                      </div>
                      <div className="tabular-nums text-primary">{sym}{fmt(toDisp(parseFloat(txn.price)))}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Delete button */}
        {!readOnly && (
          <button
            className="btn-retro text-xs text-negative border-negative/30 hover:border-negative w-full py-2"
            onClick={deleteHolding}
          >
            [DELETE HOLDING]
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { HoldingsTable } from "./holdings-table";
import { PortfolioCharts } from "./portfolio-charts";
import { AddPortfolioDialog } from "./add-portfolio-dialog";
import { useRouter } from "next/navigation";

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

interface Portfolio {
  id: string;
  name: string;
  holdings: Holding[];
}

interface HoldingSummary {
  ticker: string;
  name?: string | null;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  currency: "USD" | "CAD";
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function DashboardClient({ initialPortfolios, fxRate }: { initialPortfolios: Portfolio[]; fxRate: number }) {
  const router = useRouter();
  const [portfolios, setPortfolios] = useState(initialPortfolios);
  const [activeIdx, setActiveIdx] = useState(0);
  const [holdingSummaries, setHoldingSummaries] = useState<HoldingSummary[]>([]);

  const activePortfolio = portfolios[activeIdx] ?? null;

  const refreshPortfolios = useCallback(async () => {
    const res = await fetch("/api/portfolios");
    const data = await res.json();
    setPortfolios(data);
  }, []);

  const deletePortfolio = async (id: string) => {
    if (!confirm("Delete this portfolio and all its holdings?")) return;
    await fetch(`/api/portfolios/${id}`, { method: "DELETE" });
    const updated = portfolios.filter((p) => p.id !== id);
    setPortfolios(updated);
    setActiveIdx(Math.min(activeIdx, updated.length - 1));
  };

  const totalValue = holdingSummaries.reduce((s, h) => s + (h.currency === "USD" ? h.marketValue * fxRate : h.marketValue), 0);
  const totalPnL = holdingSummaries.reduce((s, h) => s + (h.currency === "USD" ? h.unrealizedPnL * fxRate : h.unrealizedPnL), 0);
  const totalCostBasis = totalValue - totalPnL;
  const totalPnLPct = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;

  return (
    <div>
      {/* Portfolio tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-border pb-3">
        {portfolios.map((p, i) => (
          <button
            key={p.id}
            className={`btn-retro text-xs ${activeIdx === i ? "btn-retro-primary" : ""}`}
            onClick={() => { setActiveIdx(i); setHoldingSummaries([]); }}
          >
            [{p.name.toUpperCase()}]
          </button>
        ))}
        <AddPortfolioDialog onAdd={async () => { await refreshPortfolios(); router.refresh(); }} />
        {activePortfolio && (
          <button
            className="btn-retro text-xs text-negative border-negative/30 hover:border-negative ml-auto"
            onClick={() => deletePortfolio(activePortfolio.id)}
          >
            [DELETE PORTFOLIO]
          </button>
        )}
      </div>

      {/* Summary bar */}
      {holdingSummaries.length > 0 && (
        <div className="flex gap-6 mb-6 border border-border p-4 bg-card text-sm">
          <div>
            <div className="text-xs text-muted-foreground tracking-widest mb-1">MARKET VALUE</div>
            <div className="text-lg font-medium tabular-nums">${fmt(totalValue)}</div>
          </div>
          <div className="border-l border-border pl-6">
            <div className="text-xs text-muted-foreground tracking-widest mb-1">UNREALIZED P&amp;L</div>
            <div className={`text-lg font-medium tabular-nums ${totalPnL >= 0 ? "text-positive" : "text-negative"}`}>
              {totalPnL >= 0 ? "+" : ""}${fmt(Math.abs(totalPnL))}
              <span className="text-sm ml-2">{fmtPct(totalPnLPct)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Holdings table */}
      {activePortfolio ? (
        <>
          <HoldingsTable
            key={activePortfolio.id}
            portfolioId={activePortfolio.id}
            initialHoldings={activePortfolio.holdings}
            onHoldingsChange={setHoldingSummaries}
          />
          <PortfolioCharts holdings={holdingSummaries} />
        </>
      ) : (
        <div className="text-muted-foreground text-xs py-12 text-center border border-dashed border-border">
          NO PORTFOLIOS — CREATE ONE TO BEGIN
        </div>
      )}
    </div>
  );
}

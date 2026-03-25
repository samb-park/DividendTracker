"use client";

import { useEffect, useState } from "react";

interface UpcomingItem {
  ticker: string;
  exDivDate: string;
  estimatedPayDate: string | null;
  annualDividendRate: number | null;
  shares: number;
  currency: "USD" | "CAD";
}

export function UpcomingDividends({
  fxRate,
  displayCurrency,
}: {
  fxRate: number;
  displayCurrency: "CAD" | "USD";
}) {
  const [items, setItems] = useState<UpcomingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dividends/upcoming")
      .then((r) => r.json())
      .then((d) => { setItems(d.upcoming ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading || items.length === 0) return null;

  const sym = displayCurrency === "CAD" ? "C$" : "$";

  return (
    <div className="border border-border bg-card p-4 mb-6">
      <div className="text-accent text-xs tracking-wide mb-3">&#9654; UPCOMING EX-DIV (30 DAYS)</div>
      <div className="space-y-2">
        {items.map((item) => {
          const annualRate = item.annualDividendRate;
          // Estimate per-payment income: annualRate / 4 (conservative quarterly assumption)
          const estPerPayment = annualRate
            ? (annualRate / 4) * item.shares * (item.currency === "USD" && displayCurrency === "CAD" ? fxRate : item.currency === "CAD" && displayCurrency === "USD" ? 1 / fxRate : 1)
            : null;

          return (
            <div key={item.ticker} className="flex items-center gap-3 text-[11px]">
              <span className="font-medium w-14 shrink-0 text-primary">{item.ticker}</span>
              <span className="text-muted-foreground shrink-0">ex-div {item.exDivDate}</span>
              {item.estimatedPayDate && (
                <span className="text-muted-foreground shrink-0 hidden sm:inline">pay {item.estimatedPayDate}</span>
              )}
              {estPerPayment !== null && estPerPayment > 0 && (
                <span className="ml-auto tabular-nums text-positive shrink-0">
                  ~{sym}{estPerPayment.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

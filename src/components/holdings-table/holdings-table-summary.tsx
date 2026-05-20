"use client";

import { useHoldingsStore } from "./use-holdings-store";

interface TotalsByCur {
  [currency: string]: { mkt: number; cost: number; pnl: number };
}

interface HoldingsTableSummaryProps {
  totalsByCur: TotalsByCur;
  displayCurrency?: "USD" | "CAD";
  fxRate: number;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function HoldingsTableSummary({
  totalsByCur,
  displayCurrency,
  fxRate,
}: HoldingsTableSummaryProps) {
  const mktMode = useHoldingsStore((s) => s.mktMode);

  const totalCurrencies = Object.keys(totalsByCur) as ("USD" | "CAD")[];
  if (totalCurrencies.length === 0) return null;

  const toDisp = (value: number, holdingCurrency: "USD" | "CAD") => {
    if (!displayCurrency || displayCurrency === holdingCurrency) return value;
    return displayCurrency === "CAD" ? value * fxRate : value / fxRate;
  };

  const dispSym = displayCurrency === "CAD" ? "C$" : displayCurrency === "USD" ? "$" : null;

  const fmtTotal = (mode: "mkt" | "cost") => {
    if (dispSym) {
      const total = totalCurrencies.reduce((sum, c) => {
        const s = totalsByCur[c];
        return sum + toDisp(mode === "mkt" ? s.mkt : s.cost, c);
      }, 0);
      return `${dispSym}${fmt(total)}`;
    }
    return totalCurrencies
      .map((c) => {
        const s = totalsByCur[c];
        const val = mode === "mkt" ? s.mkt : s.cost;
        return `${c === "CAD" ? "C$" : "$"}${fmt(val)}`;
      })
      .join(" / ");
  };

  const fmtTotalPnL = () => {
    if (dispSym) {
      const total = totalCurrencies.reduce(
        (sum, c) => sum + toDisp(totalsByCur[c].pnl, c),
        0
      );
      return `${total >= 0 ? "+" : ""}${dispSym}${fmt(Math.abs(total))}`;
    }
    return totalCurrencies
      .map((c) => {
        const s = totalsByCur[c];
        return `${s.pnl >= 0 ? "+" : ""}${c === "CAD" ? "C$" : "$"}${fmt(Math.abs(s.pnl))}`;
      })
      .join(" / ");
  };

  const fmtTotalPnLPct = () => {
    if (dispSym) {
      const totalCost = totalCurrencies.reduce(
        (sum, c) => sum + toDisp(totalsByCur[c].cost, c),
        0
      );
      const totalPnL = totalCurrencies.reduce(
        (sum, c) => sum + toDisp(totalsByCur[c].pnl, c),
        0
      );
      return totalCost > 0 ? fmtPct((totalPnL / totalCost) * 100) : "—";
    }
    return totalCurrencies
      .map((c) => {
        const s = totalsByCur[c];
        const pct = s.cost > 0 ? (s.pnl / s.cost) * 100 : 0;
        return fmtPct(pct);
      })
      .join(" / ");
  };

  const totalPnLPositive = totalCurrencies.every((c) => totalsByCur[c].pnl >= 0);

  return (
    <tfoot>
      <tr className="border-t-2 border-border">
        <td className="text-xs text-muted-foreground font-medium">TOTAL</td>
        <td className="hidden md:table-cell" />
        <td className="hidden lg:table-cell" />
        <td />
        <td className="hidden sm:table-cell" />
        <td className="text-right tabular-nums font-medium text-xs">
          {fmtTotal(mktMode)}
        </td>
        <td
          className={`text-right tabular-nums font-medium text-xs ${
            totalPnLPositive ? "text-positive" : "text-negative"
          }`}
        >
          <div>{fmtTotalPnL()}</div>
          <div className="text-[10px] opacity-70">{fmtTotalPnLPct()}</div>
        </td>
        <td className="hidden sm:table-cell" />
        <td className="hidden sm:table-cell" />
        <td className="hidden sm:table-cell" />
      </tr>
    </tfoot>
  );
}

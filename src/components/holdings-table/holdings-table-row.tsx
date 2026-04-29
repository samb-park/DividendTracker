"use client";

import { useCallback } from "react";
import { useHoldingsStore } from "./use-holdings-store";
import type { HoldingRow } from "./types";

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

interface HoldingsTableRowProps {
  row: HoldingRow;
  variant: "mobile" | "desktop";
  totalMarketValue: number;
  totalMarketValueCAD: number;
  totalAllMarketValueCAD: number;
  priceReasons: Record<string, "not_found" | "network">;
  isWeightExcluded: (ticker: string) => boolean;
  investTargets: Record<string, number>;
  allocMap: Record<string, number>;
  accountMapping: Record<string, string>;
  displayCurrency?: "USD" | "CAD";
  fxRate: number;
  onLongPressContext?: (info: { ticker: string; currency: "USD" | "CAD"; marketValue: number; shares: number }) => void;
  onMobilePointerDown?: () => void;
  onMobilePointerUp?: () => void;
  onMobilePointerLeave?: () => void;
}

export function HoldingsTableRow({
  row,
  variant,
  totalMarketValue,
  totalMarketValueCAD,
  totalAllMarketValueCAD,
  priceReasons,
  isWeightExcluded,
  investTargets,
  allocMap,
  accountMapping,
  displayCurrency,
  fxRate,
  onLongPressContext,
  onMobilePointerDown,
  onMobilePointerUp,
  onMobilePointerLeave,
}: HoldingsTableRowProps) {
  const selectedRowId = useHoldingsStore((s) => s.selectedRowId);
  const setSelectedRowId = useHoldingsStore((s) => s.setSelectedRowId);
  const wgtMode = useHoldingsStore((s) => s.wgtMode);
  const colMode = useHoldingsStore((s) => s.colMode);
  const priceMode = useHoldingsStore((s) => s.priceMode);
  const mktMode = useHoldingsStore((s) => s.mktMode);
  const dayMode = useHoldingsStore((s) => s.dayMode);
  const w52Mode = useHoldingsStore((s) => s.w52Mode);

  const toDisp = useCallback(
    (value: number, holdingCurrency: "USD" | "CAD") => {
      if (!displayCurrency || displayCurrency === holdingCurrency) return value;
      return displayCurrency === "CAD" ? value * fxRate : value / fxRate;
    },
    [displayCurrency, fxRate]
  );

  const toCADValue = useCallback(
    (amount: number, currency: "USD" | "CAD") =>
      currency === "USD" ? amount * fxRate : amount,
    [fxRate]
  );

  const dispSym = displayCurrency === "CAD" ? "C$" : displayCurrency === "USD" ? "$" : null;
  const cur = dispSym ?? (row.holding.currency === "CAD" ? "C$" : "$");
  const holdingCAD = toCADValue(row.marketValue, row.holding.currency);

  const weight =
    wgtMode === "total"
      ? totalAllMarketValueCAD > 0
        ? (holdingCAD / totalAllMarketValueCAD) * 100
        : 0
      : totalMarketValueCAD > 0 && !isWeightExcluded(row.holding.ticker)
        ? (holdingCAD / totalMarketValueCAD) * 100
        : 0;

  const priceUnavailable = !row.price;
  const priceReason = priceReasons[row.holding.ticker];
  const todayChange = row.price ? row.price.change * row.shares : null;
  const annualDivRate = row.price?.trailingAnnualDividendRate ?? row.price?.dividendRate ?? 0;
  const divYield = row.price?.trailingAnnualDividendYield ?? row.price?.dividendYield ?? null;
  const annualDivIncome = annualDivRate > 0 ? annualDivRate * row.shares : null;
  const sharesStr = Number.isInteger(row.shares)
    ? fmt(row.shares, 0)
    : fmt(row.shares, row.shares < 10 ? 4 : 2);

  const handleClick = () => {
    setSelectedRowId(row.holding.id);
  };

  if (variant === "mobile") {
    return (
    <div
      className={`border border-border p-3 cursor-pointer select-none active:bg-border/20 ${selectedRowId === row.holding.id ? "border-l-4 border-l-accent bg-accent/10" : "bg-card"}`}
      onClick={handleClick}
      onPointerDown={onMobilePointerDown}
      onPointerUp={onMobilePointerUp}
      onPointerLeave={onMobilePointerLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
        {/* Row 1: ticker + market value */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-accent font-medium text-sm">{row.holding.ticker}</span>
          <span className="tabular-nums text-sm font-medium flex-shrink-0">
            {priceUnavailable ? (
              <span
                className="text-negative text-xs"
                title={priceReason === "not_found" ? "Ticker not found" : "Price unavailable"}
              >
                {priceReason === "not_found" ? "DELISTED?" : "PRICE N/A"}
              </span>
            ) : row.marketValue > 0 ? (
              `${cur}${fmt(toDisp(row.marketValue, row.holding.currency))}`
            ) : (
              "—"
            )}
          </span>
        </div>
        {/* Row 2: shares·weight + today's change */}
        <div className="flex items-baseline justify-between gap-2 mt-0.5">
          <span className="text-muted-foreground/60 text-[10px] tabular-nums">
            {sharesStr}sh{totalMarketValue > 0 ? ` · ${weight.toFixed(1)}%` : ""}
          </span>
          {todayChange !== null && (
            <span
              className={`text-[10px] tabular-nums flex-shrink-0 ${todayChange >= 0 ? "text-positive" : "text-negative"}`}
            >
              {todayChange >= 0 ? "+" : ""}
              {cur}
              {fmt(Math.abs(toDisp(todayChange, row.holding.currency)))} ({fmtPct(row.price!.changePercent)})
            </span>
          )}
        </div>
        {/* Footer: P&L + dividend info */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30 text-[10px]">
          <span
            className={`tabular-nums ${row.unrealizedPnL >= 0 ? "text-positive" : "text-negative"}`}
          >
            {row.marketValue > 0
              ? `P&L ${row.unrealizedPnL >= 0 ? "+" : ""}${cur}${fmt(
                  Math.abs(toDisp(row.unrealizedPnL, row.holding.currency))
                )} (${fmtPct(row.unrealizedPnLPct)})`
              : <span className="text-muted-foreground">P&L —</span>}
          </span>
          <div className="flex items-center gap-3 flex-shrink-0 text-right">
            <div>
              <div className="text-muted-foreground/50 text-[9px]">YLD</div>
              <div className="tabular-nums text-muted-foreground">
                {divYield != null ? `${divYield.toFixed(1)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground/50 text-[9px]">DIV/YR</div>
              <div className="tabular-nums text-primary">
                {annualDivIncome != null
                  ? `${cur}${fmt(toDisp(annualDivIncome, row.holding.currency), 0)}`
                  : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop variant
  return (
    <tr
      className={`cursor-pointer ${selectedRowId === row.holding.id ? "bg-border/30" : ""}`}
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPressContext?.({
          ticker: row.holding.ticker,
          currency: row.holding.currency,
          marketValue: row.marketValue,
          shares: row.shares,
        });
      }}
    >
      <td className="font-medium text-accent">
        <span>{row.holding.ticker}</span>
      </td>
      <td className="text-muted-foreground text-[10px] hidden md:table-cell">
        {accountMapping[row.holding.ticker] ?? "—"}
      </td>
      <td className="text-muted-foreground text-xs truncate max-w-[8rem] hidden lg:table-cell">
        {row.holding.name || "—"}
      </td>
      <td className="text-right tabular-nums">
        {priceMode === "price"
          ? row.price
            ? `${cur}${fmt(toDisp(row.price.price, row.holding.currency))}`
            : <span className="text-negative text-[10px]" title={priceReason === "not_found" ? "Ticker not found — may be delisted or invalid" : "Price data unavailable"}>
                {priceReason === "not_found" ? "DELISTED?" : "PRICE N/A"}
              </span>
          : row.avgCost > 0
            ? `${cur}${fmt(toDisp(row.avgCost, row.holding.currency))}`
            : "—"}
      </td>
      <td className="text-right tabular-nums text-muted-foreground hidden sm:table-cell">
        {wgtMode === "alloc"
          ? row.holding.ticker in investTargets
            ? `${cur}${fmt(toDisp(allocMap[row.holding.ticker] ?? 0, row.holding.currency))}`
            : "—"
          : totalMarketValue > 0
            ? `${weight.toFixed(1)}%`
            : "—"}
      </td>
      <td className="text-right tabular-nums">
        {mktMode === "mkt"
          ? row.marketValue > 0
            ? `${cur}${fmt(toDisp(row.marketValue, row.holding.currency))}`
            : "—"
          : row.costBasis > 0
            ? `${cur}${fmt(toDisp(row.costBasis, row.holding.currency))}`
            : "—"}
      </td>
      <td className={`text-right tabular-nums ${row.unrealizedPnL >= 0 ? "text-positive" : "text-negative"}`}>
        {row.marketValue > 0
          ? colMode === "usd"
            ? `${row.unrealizedPnL >= 0 ? "+" : ""}${cur}${fmt(
                Math.abs(toDisp(row.unrealizedPnL, row.holding.currency))
              )}`
            : fmtPct(row.unrealizedPnLPct)
          : "—"}
      </td>
      <td
        className={`text-right tabular-nums hidden sm:table-cell ${
          dayMode === "day"
            ? row.price
              ? row.price.changePercent >= 0
                ? "text-positive"
                : "text-negative"
              : ""
            : "text-primary"
        }`}
      >
        {dayMode === "day"
          ? row.price
            ? fmtPct(row.price.changePercent)
            : "—"
          : dayMode === "yld"
            ? (() => {
                const yld =
                  row.price?.trailingAnnualDividendYield ??
                  row.price?.dividendYield ??
                  null;
                return yld != null ? `${yld.toFixed(2)}%` : "—";
              })()
            : (() => {
                const rate =
                  row.price?.trailingAnnualDividendRate ??
                  row.price?.dividendRate ??
                  0;
                const yoc =
                  rate > 0 && row.costBasis > 0
                    ? (rate * row.shares / row.costBasis) * 100
                    : null;
                return yoc != null ? `${yoc.toFixed(2)}%` : "—";
              })()}
      </td>
      <td className="text-right tabular-nums hidden sm:table-cell">
        {sharesStr}
      </td>
      <td
        className={`hidden sm:table-cell text-right tabular-nums ${
          w52Mode === "high"
            ? row.price && row.price.fromHighPct < -10
              ? "text-negative"
              : "text-muted-foreground"
            : row.price && row.price.fromLowPct > 30
              ? "text-positive"
              : "text-muted-foreground"
        }`}
      >
        {w52Mode === "high"
          ? row.price?.week52High
            ? `${cur}${fmt(toDisp(row.price.week52High, row.holding.currency))} (${fmtPct(row.price.fromHighPct)})`
            : "—"
          : row.price?.week52Low
            ? `${cur}${fmt(toDisp(row.price.week52Low, row.holding.currency))} (${fmtPct(row.price.fromLowPct)})`
            : "—"}
      </td>
    </tr>
  );
}

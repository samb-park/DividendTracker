"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { HoldingWithPrice } from "@/types";

// Generate a consistent color based on ticker string
function getTickerColor(ticker: string): string {
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-indigo-500",
    "bg-teal-500",
    "bg-rose-500",
    "bg-amber-500",
  ];

  let hash = 0;
  for (let i = 0; i < ticker.length; i++) {
    hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

// Return display mode type
export type ReturnDisplayMode = "all_time" | "daily";

interface HoldingCardProps {
  holding: HoldingWithPrice;
  onClick?: () => void;
  returnMode?: ReturnDisplayMode;
}

export function HoldingCard({
  holding,
  onClick,
  returnMode = "all_time",
}: HoldingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const {
    ticker,
    quantity,
    currency,
    marketValue,
    profitLoss,
    profitLossPercent,
    dailyChange,
    dailyChangePercent,
    logoUrl,
    avgCost,
    currentPrice,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    dividendYield,
  } = holding;

  // Use all-time return or daily change based on mode
  const displayChange =
    returnMode === "all_time" ? profitLoss : dailyChange;
  const displayChangePercent =
    returnMode === "all_time" ? profitLossPercent : dailyChangePercent;

  const changeNum = parseFloat(displayChange || "0");
  const changePercentNum = parseFloat(displayChangePercent || "0");
  const isPositive = changeNum >= 0;

  const formatCurrency = (value: string | undefined, showCurrency = false) => {
    if (!value) return "-";
    const num = parseFloat(value);
    let formatted = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(num));
    // Remove "US" prefix from USD formatting
    formatted = formatted.replace("US$", "$");
    return showCurrency ? `${formatted} ${currency}` : formatted;
  };

  const formatQuantity = (qty: string) => {
    const num = parseFloat(qty);
    if (num >= 1000) {
      return num.toLocaleString("en-CA", { maximumFractionDigits: 3 });
    }
    // Show more decimal places for fractional shares
    const decimals = num % 1 === 0 ? 0 : num < 1 ? 4 : 3;
    return num.toFixed(decimals);
  };

  const formatPercent = (value: string | undefined) => {
    if (!value) return "-";
    const num = parseFloat(value);
    const sign = num >= 0 ? "+" : "";
    return `${sign}${num.toFixed(2)}%`;
  };

  // Get first 2 characters for avatar fallback
  const avatarText = ticker.slice(0, 2).toUpperCase();
  const avatarColor = getTickerColor(ticker);

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  return (
    <div
      className={cn(
        "rounded-lg transition-colors",
        "bg-card hover:bg-muted/30"
      )}
    >
      {/* Main Row */}
      <div
        onClick={onClick}
        className="flex items-center gap-3 p-4 cursor-pointer"
      >
        {/* Logo/Avatar */}
        <div className="relative w-10 h-10 flex-shrink-0">
          {logoUrl && !imgError ? (
            <Image
              src={logoUrl}
              alt={ticker}
              fill
              className="rounded-full object-cover"
              onError={() => setImgError(true)}
              unoptimized
            />
          ) : (
            <div
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full text-white font-semibold text-sm",
                avatarColor
              )}
            >
              {avatarText}
            </div>
          )}
        </div>

        {/* Ticker & Shares */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base">{ticker}</div>
          <div className="text-sm text-muted-foreground">
            {formatQuantity(quantity)} shares
          </div>
        </div>

        {/* Value & Return */}
        <div className="text-right flex-shrink-0">
          <div className="font-semibold">
            {formatCurrency(marketValue, true)}
          </div>
          <div
            className={cn(
              "text-sm font-medium",
              isPositive ? "text-green-500" : "text-red-500"
            )}
          >
            {isPositive ? "+" : "-"}
            {formatCurrency(displayChange)} ({formatPercent(displayChangePercent)})
          </div>
        </div>

        {/* Expand Button */}
        <button
          onClick={handleExpand}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-border/50">
          <div className="grid grid-cols-2 gap-3 pt-3 text-sm">
            <div>
              <span className="text-muted-foreground">Avg Cost</span>
              <div className="font-medium">{formatCurrency(avgCost)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Current Price</span>
              <div className="font-medium">{formatCurrency(currentPrice)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">52W High</span>
              <div className="font-medium">{formatCurrency(fiftyTwoWeekHigh)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">52W Low</span>
              <div className="font-medium">{formatCurrency(fiftyTwoWeekLow)}</div>
            </div>
            {dividendYield && (
              <div>
                <span className="text-muted-foreground">Dividend Yield</span>
                <div className="font-medium">{dividendYield}%</div>
              </div>
            )}
            {returnMode === "all_time" && dailyChange && (
              <div>
                <span className="text-muted-foreground">Today</span>
                <div
                  className={cn(
                    "font-medium",
                    parseFloat(dailyChange) >= 0
                      ? "text-green-500"
                      : "text-red-500"
                  )}
                >
                  {parseFloat(dailyChange) >= 0 ? "+" : ""}
                  {formatCurrency(dailyChange)} ({formatPercent(dailyChangePercent)})
                </div>
              </div>
            )}
            {returnMode === "daily" && profitLoss && (
              <div>
                <span className="text-muted-foreground">All Time</span>
                <div
                  className={cn(
                    "font-medium",
                    parseFloat(profitLoss) >= 0
                      ? "text-green-500"
                      : "text-red-500"
                  )}
                >
                  {parseFloat(profitLoss) >= 0 ? "+" : ""}
                  {formatCurrency(profitLoss)} ({formatPercent(profitLossPercent)})
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface HoldingCardsListProps {
  holdings: HoldingWithPrice[];
  onCardClick?: (ticker: string) => void;
  returnMode?: ReturnDisplayMode;
}

export function HoldingCardsList({
  holdings,
  onCardClick,
  returnMode = "all_time",
}: HoldingCardsListProps) {
  // Sort by market value descending
  const sortedHoldings = [...holdings].sort((a, b) => {
    const valueA = parseFloat(a.marketValue || "0");
    const valueB = parseFloat(b.marketValue || "0");
    return valueB - valueA;
  });

  return (
    <div className="space-y-1">
      {sortedHoldings.map((holding) => (
        <HoldingCard
          key={holding.id}
          holding={holding}
          onClick={() => onCardClick?.(holding.ticker)}
          returnMode={returnMode}
        />
      ))}
    </div>
  );
}

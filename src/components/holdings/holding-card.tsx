"use client";

import { cn } from "@/lib/utils";
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

interface HoldingCardProps {
  holding: HoldingWithPrice;
  onClick?: () => void;
}

export function HoldingCard({ holding, onClick }: HoldingCardProps) {
  const {
    ticker,
    name,
    quantity,
    avgCost,
    currency,
    marketValue,
    dailyChange,
    dailyChangePercent,
  } = holding;

  const dailyChangeNum = parseFloat(dailyChange || "0");
  const dailyChangePercentNum = parseFloat(dailyChangePercent || "0");
  const isPositive = dailyChangeNum >= 0;

  const formatCurrency = (value: string | undefined) => {
    if (!value) return "-";
    const num = parseFloat(value);
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatQuantity = (qty: string) => {
    const num = parseFloat(qty);
    if (num >= 1000) {
      return num.toLocaleString("en-CA", { maximumFractionDigits: 2 });
    }
    return num.toFixed(num % 1 === 0 ? 0 : 4);
  };

  // Get first 2 characters for avatar
  const avatarText = ticker.slice(0, 2).toUpperCase();
  const avatarColor = getTickerColor(ticker);

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-4 rounded-lg",
        "bg-card hover:bg-muted/50 transition-colors cursor-pointer",
        "border border-transparent hover:border-border"
      )}
    >
      {/* Ticker Avatar */}
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full text-white font-semibold text-sm",
          avatarColor
        )}
      >
        {avatarText}
      </div>

      {/* Info Section */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{ticker}</span>
          {name && (
            <span className="text-sm text-muted-foreground truncate">
              {name}
            </span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {formatQuantity(quantity)} | {formatCurrency(avgCost)}
        </div>
      </div>

      {/* Value Section */}
      <div className="text-right">
        <div className="font-semibold">{formatCurrency(marketValue)}</div>
        <div
          className={cn(
            "text-sm",
            isPositive ? "text-green-500" : "text-red-500"
          )}
        >
          {isPositive ? "+" : ""}
          {formatCurrency(dailyChange?.replace("-", ""))}
          {dailyChangeNum < 0 && "-"}
          <span className="ml-1">
            {isPositive ? "+" : ""}
            {dailyChangePercentNum.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}

interface HoldingCardsListProps {
  holdings: HoldingWithPrice[];
  onCardClick?: (ticker: string) => void;
}

export function HoldingCardsList({
  holdings,
  onCardClick,
}: HoldingCardsListProps) {
  // Sort by market value descending
  const sortedHoldings = [...holdings].sort((a, b) => {
    const valueA = parseFloat(a.marketValue || "0");
    const valueB = parseFloat(b.marketValue || "0");
    return valueB - valueA;
  });

  return (
    <div className="space-y-2">
      {sortedHoldings.map((holding) => (
        <HoldingCard
          key={holding.id}
          holding={holding}
          onClick={() => onCardClick?.(holding.ticker)}
        />
      ))}
    </div>
  );
}

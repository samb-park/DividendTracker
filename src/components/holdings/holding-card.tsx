"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { LineChart, Line, ResponsiveContainer } from "recharts";
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

interface SparklineProps {
  ticker: string;
}

function Sparkline({ ticker }: SparklineProps) {
  const [data, setData] = useState<{ close: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setHasError(false);
        // Encode ticker for URL safety (handles special characters like .)
        const encodedTicker = encodeURIComponent(ticker);
        const res = await fetch(`/api/historical/${encodedTicker}?period=1W`);
        if (res.ok) {
          const prices = await res.json();
          if (Array.isArray(prices) && prices.length > 0) {
            setData(prices.map((p: { close: number }) => ({ close: p.close })));
          } else {
            setHasError(true);
          }
        } else {
          setHasError(true);
        }
      } catch (error) {
        console.error(`Failed to fetch sparkline for ${ticker}:`, error);
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [ticker]);

  // Show loading skeleton
  if (isLoading) {
    return (
      <div className="w-16 h-8 bg-muted/50 rounded animate-pulse" />
    );
  }

  // Show nothing if error or not enough data
  if (hasError || data.length < 2) {
    return <div className="w-16 h-8" />;
  }

  const startPrice = data[0].close;
  const endPrice = data[data.length - 1].close;
  const isPositive = endPrice >= startPrice;
  const color = isPositive ? "#22c55e" : "#ef4444";

  return (
    <div className="w-16 h-8">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="close"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
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
          "flex items-center justify-center w-10 h-10 rounded-full text-white font-semibold text-sm flex-shrink-0",
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
            <span className="text-sm text-muted-foreground truncate max-w-[120px]">
              {name}
            </span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {formatQuantity(quantity)} | {formatCurrency(avgCost)}
        </div>
      </div>

      {/* Sparkline Chart */}
      <Sparkline ticker={ticker} />

      {/* Value Section */}
      <div className="text-right flex-shrink-0">
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

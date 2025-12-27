"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { QuoteData } from "@/types";

const PERIODS = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y"] as const;

// Simple currency formatter
const formatCurrency = (value: number | string, currency: string = "USD") => {
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numValue).replace("US$", "$");
};
type Period = (typeof PERIODS)[number];

interface ChartDataPoint {
  date: string;
  close: number;
}

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = params.ticker as string;

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("1M");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch quote data
  useEffect(() => {
    async function fetchQuote() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(ticker)}&mode=quote`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Ticker not found");
            return;
          }
          throw new Error("Failed to fetch quote");
        }
        const data = await res.json();
        setQuote(data);
      } catch {
        setError("Failed to fetch stock data");
      } finally {
        setIsLoading(false);
      }
    }

    if (ticker) {
      fetchQuote();
    }
  }, [ticker]);

  // Fetch chart data
  useEffect(() => {
    async function fetchChart() {
      if (!ticker) return;

      setIsLoadingChart(true);
      try {
        const res = await fetch(`/api/historical/${encodeURIComponent(ticker)}?period=${selectedPeriod}`);
        if (res.ok) {
          const data = await res.json();
          setChartData(data);
        }
      } catch (err) {
        console.error("Failed to fetch chart data:", err);
      } finally {
        setIsLoadingChart(false);
      }
    }

    fetchChart();
  }, [ticker, selectedPeriod]);

  const handleAddToPortfolio = () => {
    router.push(`/transactions/new?ticker=${ticker}`);
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="p-4 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="text-center py-12 text-muted-foreground">
          <p>{error || "Stock not found"}</p>
        </div>
      </div>
    );
  }

  const priceChange = quote.previousClose ? quote.price - quote.previousClose : 0;
  const priceChangePercent = quote.previousClose
    ? (priceChange / quote.previousClose) * 100
    : 0;
  const isPositive = priceChange >= 0;

  // Format chart data
  const formattedChartData = chartData.map((point) => {
    const date = new Date(point.date);
    let dateLabel: string;

    if (selectedPeriod === "1D") {
      dateLabel = date.toLocaleTimeString("en-CA", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (selectedPeriod === "1W") {
      dateLabel = date.toLocaleDateString("en-CA", {
        weekday: "short",
      });
    } else {
      dateLabel = date.toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      });
    }

    return {
      date: dateLabel,
      price: point.close,
    };
  });

  // Calculate chart change
  const startPrice = formattedChartData.length > 0 ? formattedChartData[0].price : quote.price;
  const endPrice = formattedChartData.length > 0
    ? formattedChartData[formattedChartData.length - 1].price
    : quote.price;
  const periodChange = endPrice - startPrice;
  const periodChangePercent = startPrice > 0 ? (periodChange / startPrice) * 100 : 0;
  const isPeriodPositive = periodChange >= 0;

  // Calculate Y-axis domain
  const yAxisDomain = (() => {
    if (formattedChartData.length === 0) return ["auto", "auto"] as const;
    const prices = formattedChartData.map((d) => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice;
    const padding = Math.max(range * 0.1, minPrice * 0.01);
    return [minPrice - padding, maxPrice + padding] as [number, number];
  })();

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{quote.ticker}</h1>
            <Badge variant="outline">{quote.exchange}</Badge>
          </div>
          {quote.name && (
            <p className="text-sm text-muted-foreground">{quote.name}</p>
          )}
        </div>
      </div>

      {/* Price Section */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold">
            {formatCurrency(quote.price, quote.currency)}
          </span>
          <span className="text-sm text-muted-foreground">{quote.currency}</span>
        </div>
        <div className="flex items-center gap-2">
          {isPositive ? (
            <TrendingUp className="h-5 w-5 text-green-500" />
          ) : (
            <TrendingDown className="h-5 w-5 text-red-500" />
          )}
          <span
            className={cn(
              "font-medium",
              isPositive ? "text-green-500" : "text-red-500"
            )}
          >
            {isPositive ? "+" : ""}
            {formatCurrency(priceChange, quote.currency)} ({isPositive ? "+" : ""}
            {priceChangePercent.toFixed(2)}%)
          </span>
          <span className="text-sm text-muted-foreground">today</span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-48 w-full">
        {isLoadingChart ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Loading chart...
          </div>
        ) : formattedChartData.length > 1 ? (
          <div className="h-full flex flex-col">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formattedChartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis domain={yAxisDomain} hide />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [
                      formatCurrency(value as number, quote.currency),
                      "Price",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke={isPeriodPositive ? "#22c55e" : "#ef4444"}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center py-2">
              <span
                className={cn(
                  "text-xs",
                  isPeriodPositive ? "text-green-500" : "text-red-500"
                )}
              >
                {selectedPeriod}: {isPeriodPositive ? "+" : ""}
                {formatCurrency(periodChange, quote.currency)} ({isPeriodPositive ? "+" : ""}
                {periodChangePercent.toFixed(2)}%)
              </span>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No chart data available
          </div>
        )}
      </div>

      {/* Period Selector */}
      <div className="flex justify-center gap-1">
        {PERIODS.map((period) => (
          <button
            key={period}
            onClick={() => setSelectedPeriod(period)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full transition-colors outline-none focus:outline-none",
              selectedPeriod === period
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {period}
          </button>
        ))}
      </div>

      {/* Stock Details */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4">
            {quote.previousClose && (
              <div>
                <p className="text-sm text-muted-foreground">Previous Close</p>
                <p className="font-medium">
                  {formatCurrency(quote.previousClose, quote.currency)}
                </p>
              </div>
            )}
            {quote.fiftyTwoWeekHigh && (
              <div>
                <p className="text-sm text-muted-foreground">52 Week High</p>
                <p className="font-medium">
                  {formatCurrency(quote.fiftyTwoWeekHigh, quote.currency)}
                </p>
              </div>
            )}
            {quote.fiftyTwoWeekLow && (
              <div>
                <p className="text-sm text-muted-foreground">52 Week Low</p>
                <p className="font-medium">
                  {formatCurrency(quote.fiftyTwoWeekLow, quote.currency)}
                </p>
              </div>
            )}
            {quote.dividendYield !== undefined && quote.dividendYield > 0 && (
              <div>
                <p className="text-sm text-muted-foreground">Dividend Yield</p>
                <p className="font-medium">{quote.dividendYield.toFixed(2)}%</p>
              </div>
            )}
            {quote.exchange && (
              <div>
                <p className="text-sm text-muted-foreground">Exchange</p>
                <p className="font-medium">{quote.exchange}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Currency</p>
              <p className="font-medium">{quote.currency}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add to Portfolio Button */}
      <Button onClick={handleAddToPortfolio} className="w-full" size="lg">
        <Plus className="h-5 w-5 mr-2" />
        Add to Portfolio
      </Button>

      {quote.cached && (
        <p className="text-xs text-muted-foreground text-center">
          Cached price data
        </p>
      )}
    </div>
  );
}

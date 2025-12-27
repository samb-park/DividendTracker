"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CA, US } from "country-flag-icons/react/3x2";
import type { HoldingWithPrice } from "@/types";

const PERIODS = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y"] as const;
type Period = (typeof PERIODS)[number];

interface ChartDataPoint {
  date: string;
  totalValue: number;
  totalCost: number;
}

type DisplayCurrency = "CAD" | "USD";

interface PortfolioHeaderProps {
  holdings: HoldingWithPrice[];
  currency?: DisplayCurrency;
  onCurrencyChange?: (currency: DisplayCurrency) => void;
}

export function PortfolioHeader({
  holdings,
  currency = "CAD",
  onCurrencyChange,
}: PortfolioHeaderProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("1M");
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isLoadingChart, setIsLoadingChart] = useState(false);

  // Calculate portfolio summary from holdings
  const summary = holdings.reduce(
    (acc, h) => {
      const value = parseFloat(h.marketValue || "0");
      const cost = parseFloat(h.quantity || "0") * parseFloat(h.avgCost || "0");
      const dailyChange = parseFloat(h.dailyChange || "0");

      return {
        totalValue: acc.totalValue + value,
        totalCost: acc.totalCost + cost,
        dailyChange: acc.dailyChange + dailyChange,
      };
    },
    { totalValue: 0, totalCost: 0, dailyChange: 0 }
  );

  const profitLoss = summary.totalValue - summary.totalCost;
  const profitLossPercent =
    summary.totalCost > 0 ? (profitLoss / summary.totalCost) * 100 : 0;
  const dailyChangePercent =
    summary.totalValue > 0
      ? (summary.dailyChange / (summary.totalValue - summary.dailyChange)) * 100
      : 0;

  // Fetch chart data from Yahoo Finance historical API
  useEffect(() => {
    const fetchChartData = async () => {
      if (holdings.length === 0) return;

      setIsLoadingChart(true);
      try {
        const res = await fetch(`/api/portfolio/chart?period=${selectedPeriod}`);
        if (res.ok) {
          const data: ChartDataPoint[] = await res.json();
          setChartData(data);
        }
      } catch (error) {
        console.error("Failed to fetch chart data:", error);
      } finally {
        setIsLoadingChart(false);
      }
    };

    fetchChartData();
  }, [selectedPeriod, holdings.length]);

  // Format chart data for display
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
        hour: "2-digit",
      });
    } else {
      dateLabel = date.toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      });
    }

    return {
      date: dateLabel,
      value: point.totalValue,
      cost: point.totalCost,
      fullDate: point.date,
    };
  });

  // Calculate chart color based on period change
  const startValue = formattedChartData.length > 0 ? formattedChartData[0].value : summary.totalValue;
  const endValue = formattedChartData.length > 0
    ? formattedChartData[formattedChartData.length - 1].value
    : summary.totalValue;
  const periodChange = endValue - startValue;
  const periodChangePercent = startValue > 0 ? (periodChange / startValue) * 100 : 0;
  const isPositive = periodChange >= 0;
  const chartColor = isPositive ? "#22c55e" : "#ef4444";

  // Calculate Y-axis domain to show both Portfolio Value and Net Deposits clearly
  const yAxisDomain = (() => {
    if (formattedChartData.length === 0) return ["auto", "auto"] as const;

    // Get all non-zero values from both lines
    const valueData = formattedChartData.map(d => d.value).filter(v => v > 0);
    const costData = formattedChartData.map(d => d.cost).filter(v => v > 0);
    const allData = [...valueData, ...costData];

    if (allData.length === 0) return ["auto", "auto"] as const;

    const minValue = Math.min(...allData);
    const maxValue = Math.max(...allData);
    const range = maxValue - minValue;

    // Add 15% padding on each side to make variations visible
    // Minimum padding of 0.5% of minValue for flat ranges
    const padding = Math.max(range * 0.15, minValue * 0.005);

    return [minValue - padding, maxValue + padding] as [number, number];
  })();

  const formatCurrency = (value: number) => {
    const formatted = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    // Remove "US" prefix from USD formatting (US$1,234.56 -> $1,234.56)
    return formatted.replace("US$", "$");
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatChange = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${formatCurrency(Math.abs(value)).replace(currency, currency)}`;
  };

  return (
    <div className="space-y-4">
      {/* Summary Section - Wealthsimple Style */}
      <div className="flex items-start justify-between">
        {/* Left: Value and Changes */}
        <div className="space-y-1">
          {/* Total Value */}
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">
              {formatCurrency(summary.totalValue)}
            </h2>
            <span className="text-sm text-muted-foreground">
              {currency}
            </span>
          </div>

          {/* Daily Change */}
          <div
            className={cn(
              "text-sm",
              summary.dailyChange >= 0 ? "text-red-500" : "text-red-500"
            )}
          >
            <span className={summary.dailyChange >= 0 ? "text-green-500" : "text-red-500"}>
              {formatChange(summary.dailyChange)} ({formatPercent(dailyChangePercent)})
            </span>
            <span className="text-muted-foreground ml-1">past day</span>
          </div>

          {/* Open P/L */}
          <div className="text-sm">
            <span className="text-muted-foreground">Open P/L </span>
            <span
              className={cn(
                "font-medium",
                profitLoss >= 0 ? "text-green-500" : "text-red-500"
              )}
            >
              {formatChange(profitLoss)} ({formatPercent(profitLossPercent)})
            </span>
          </div>
        </div>

        {/* Right: Currency Toggle */}
        {onCurrencyChange && (
          <div className="flex items-center bg-muted rounded-full p-1 gap-1">
            <button
              onClick={() => onCurrencyChange("CAD")}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-all overflow-hidden",
                currency === "CAD"
                  ? "ring-2 ring-primary"
                  : "opacity-40"
              )}
            >
              <CA title="CAD" className="w-6 h-6 rounded-sm" />
            </button>
            <button
              onClick={() => onCurrencyChange("USD")}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-all overflow-hidden",
                currency === "USD"
                  ? "ring-2 ring-primary"
                  : "opacity-40"
              )}
            >
              <US title="USD" className="w-6 h-6 rounded-sm" />
            </button>
          </div>
        )}
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
                    formatter={(value, name) => [
                      formatCurrency(value as number),
                      name === "value" ? "Portfolio Value" : "Net Deposits"
                    ]}
                    labelFormatter={(label) => label}
                  />
                  {/* Net Deposits Line - dashed gray */}
                  <Line
                    type="monotone"
                    dataKey="cost"
                    name="cost"
                    stroke="#9ca3af"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                  {/* Portfolio Value Line - solid green */}
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="value"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#22c55e" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Period change indicator */}
            <div className="text-center py-2">
              <span className={cn(
                "text-xs",
                isPositive ? "text-green-500" : "text-red-500"
              )}>
                {selectedPeriod}: {formatChange(periodChange)} ({formatPercent(periodChangePercent)})
              </span>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Loading historical data...
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
    </div>
  );
}

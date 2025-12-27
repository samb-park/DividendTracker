"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { HoldingWithPrice } from "@/types";

const PERIODS = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y"] as const;
type Period = (typeof PERIODS)[number];

interface ChartDataPoint {
  date: string;
  totalValue: number;
  totalCost: number;
}

interface PortfolioHeaderProps {
  holdings: HoldingWithPrice[];
  currency?: string;
}

export function PortfolioHeader({
  holdings,
  currency = "CAD",
}: PortfolioHeaderProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("1M");
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [hideValue, setHideValue] = useState(false);

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

  // Calculate Y-axis domain to show both lines clearly
  const yAxisDomain = (() => {
    if (formattedChartData.length === 0) return ["auto", "auto"] as const;

    const allValues = formattedChartData.flatMap(d => [d.value, d.cost]);
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    const range = maxValue - minValue;
    // Use larger padding: 50% of range or 2% of minValue, whichever is larger
    const padding = Math.max(range * 0.5, minValue * 0.02);

    return [minValue - padding, maxValue + padding] as [number, number];
  })();

  const formatCurrency = (value: number) => {
    if (hideValue) return "••••••";
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    if (hideValue) return "••••";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatChange = (value: number) => {
    if (hideValue) return "••••••";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${formatCurrency(Math.abs(value)).replace(currency, currency)}`;
  };

  return (
    <div className="space-y-4">
      {/* Summary Section */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <p className="text-sm text-muted-foreground uppercase tracking-wide">
            Market Value
          </p>
          <button
            onClick={() => setHideValue(!hideValue)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {hideValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <h2 className="text-4xl font-bold tracking-tight">
          {hideValue ? "••••••••" : formatCurrency(summary.totalValue)}
        </h2>

        {/* Daily Change */}
        <div
          className={cn(
            "flex items-center justify-center gap-1 text-sm",
            summary.dailyChange >= 0 ? "text-green-500" : "text-red-500"
          )}
        >
          {summary.dailyChange >= 0 ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          <span>
            {formatChange(summary.dailyChange)} {formatPercent(dailyChangePercent)}
          </span>
        </div>

        {/* Open P/L */}
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="text-muted-foreground">Open P/L</span>
          <span
            className={cn(
              "font-medium",
              profitLoss >= 0 ? "text-green-500" : "text-red-500"
            )}
          >
            {profitLoss >= 0 ? (
              <TrendingUp className="h-3 w-3 inline mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 inline mr-1" />
            )}
            {formatChange(profitLoss)} {formatPercent(profitLossPercent)}
          </span>
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
              "px-3 py-1.5 text-xs font-medium rounded-full transition-colors",
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

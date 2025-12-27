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
  ReferenceLine,
} from "recharts";
import type { HoldingWithPrice, PortfolioSnapshot } from "@/types";

const PERIODS = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y"] as const;
type Period = (typeof PERIODS)[number];

interface PortfolioHeaderProps {
  holdings: HoldingWithPrice[];
  currency?: string;
}

export function PortfolioHeader({
  holdings,
  currency = "CAD",
}: PortfolioHeaderProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("1M");
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
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

  // Fetch snapshots for chart
  useEffect(() => {
    const fetchSnapshots = async () => {
      setIsLoadingChart(true);
      try {
        const res = await fetch(`/api/portfolio/snapshot?period=${selectedPeriod}`);
        if (res.ok) {
          const data = await res.json();
          setSnapshots(data);
        }
      } catch (error) {
        console.error("Failed to fetch snapshots:", error);
      } finally {
        setIsLoadingChart(false);
      }
    };

    fetchSnapshots();
  }, [selectedPeriod]);

  // Save snapshot when component mounts (once per page load)
  useEffect(() => {
    const saveSnapshot = async () => {
      try {
        await fetch("/api/portfolio/snapshot", { method: "POST" });
      } catch (error) {
        console.error("Failed to save snapshot:", error);
      }
    };

    if (holdings.length > 0) {
      saveSnapshot();
    }
  }, [holdings.length]);

  // Format chart data
  const chartData = snapshots.map((s) => ({
    date: new Date(s.date).toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
    }),
    value: parseFloat(s.totalValue),
    fullDate: s.date,
  }));

  // Add current value as the last point if we have data
  if (chartData.length > 0 && summary.totalValue > 0) {
    const today = new Date().toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
    });
    const lastPoint = chartData[chartData.length - 1];
    if (lastPoint.date !== today) {
      chartData.push({
        date: today,
        value: summary.totalValue,
        fullDate: new Date().toISOString(),
      });
    }
  }

  // Calculate chart color based on period change
  const startValue = chartData.length > 0 ? chartData[0].value : summary.totalValue;
  const periodChange = summary.totalValue - startValue;
  const isPositive = periodChange >= 0;
  const chartColor = isPositive ? "#22c55e" : "#ef4444";

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
      <div className="h-40 w-full">
        {isLoadingChart ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Loading chart...
          </div>
        ) : chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <XAxis dataKey="date" hide />
              <YAxis domain={["dataMin", "dataMax"]} hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value) => [formatCurrency(value as number), "Value"]}
                labelFormatter={(label) => label}
              />
              <ReferenceLine
                y={startValue}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={chartColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: chartColor }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Not enough data for chart. Check back tomorrow!
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

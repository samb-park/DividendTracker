"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Star, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

interface QuoteData {
  symbol: string;
  shortName: string;
  longName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  marketCap: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  trailingPE: number;
  dividendYield: number;
  currency: string;
}

interface ChartData {
  timestamp: number;
  close: number;
}

type Period = "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y" | "5Y";

export default function StockDetailPage() {
  const params = useParams();
  const symbol = (params.symbol as string)?.toUpperCase();

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("1M");
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    const favorites = JSON.parse(localStorage.getItem("favoriteStocks") || "[]");
    setIsFavorite(favorites.includes(symbol));
  }, [symbol]);

  useEffect(() => {
    if (symbol) {
      fetchQuote();
    }
  }, [symbol]);

  useEffect(() => {
    if (symbol) {
      fetchChart();
    }
  }, [symbol, period]);

  async function fetchQuote() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stock/quote?symbol=${symbol}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQuote(data);
    } catch (err) {
      setError("Unable to load stock data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchChart() {
    setChartLoading(true);
    try {
      const res = await fetch(`/api/stock/chart?symbol=${symbol}&period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch chart");
      const data = await res.json();
      if (Array.isArray(data)) {
        setChartData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setChartLoading(false);
    }
  }

  function toggleFavorite() {
    const favorites = JSON.parse(localStorage.getItem("favoriteStocks") || "[]");
    let newFavorites: string[];
    if (isFavorite) {
      newFavorites = favorites.filter((s: string) => s !== symbol);
    } else {
      newFavorites = [...favorites, symbol];
    }
    localStorage.setItem("favoriteStocks", JSON.stringify(newFavorites));
    setIsFavorite(!isFavorite);
    window.dispatchEvent(new CustomEvent("favoritesChange"));
  }

  function formatNumber(num: number | undefined, decimals = 2): string {
    if (num === undefined || num === null) return "-";
    return num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function formatLargeNumber(num: number | undefined): string {
    if (num === undefined || num === null) return "-";
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    return num.toLocaleString();
  }

  const periods: Period[] = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"];
  const chartHeight = 200;

  function renderChart() {
    if (chartData.length === 0) return null;

    const prices = chartData.map(d => d.close);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;

    const points = chartData.map((d, i) => {
      const x = (i / (chartData.length - 1)) * 100;
      const y = chartHeight - ((d.close - minPrice) / range) * chartHeight;
      return `${x},${y}`;
    }).join(" ");

    const isPositive = chartData.length > 1 && chartData[chartData.length - 1].close >= chartData[0].close;
    const strokeColor = isPositive ? "#16a34a" : "#dc2626";
    const fillColor = isPositive ? "rgba(22, 163, 74, 0.1)" : "rgba(220, 38, 38, 0.1)";
    const fillPoints = `0,${chartHeight} ${points} 100,${chartHeight}`;

    return (
      <svg viewBox={`0 0 100 ${chartHeight}`} className="w-full h-48" preserveAspectRatio="none">
        <polygon points={fillPoints} fill={fillColor} />
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/favorites" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </Link>
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="h-8 w-24 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="h-12 w-48 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/favorites" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">{symbol}</h1>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
          <p className="text-gray-500">{error || "Stock not found"}</p>
          <button
            onClick={fetchQuote}
            className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const isPositive = quote.regularMarketChange >= 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/favorites" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{symbol}</h1>
            <p className="text-xs text-gray-500 truncate max-w-[200px]">{quote.shortName || quote.longName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchQuote}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <RefreshCw className="w-5 h-5 text-gray-500" />
          </button>
          <button
            onClick={toggleFavorite}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <Star
              className={`w-5 h-5 ${isFavorite ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
            />
          </button>
        </div>
      </div>

      {/* Price Card */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold text-gray-900">
            {quote.currency === "USD" ? "$" : quote.currency === "CAD" ? "C$" : ""}{formatNumber(quote.regularMarketPrice)}
          </span>
          <div className={`flex items-center gap-1 ${isPositive ? "text-green-600" : "text-red-600"}`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span className="text-sm font-medium">
              {isPositive ? "+" : ""}{formatNumber(quote.regularMarketChange)} ({isPositive ? "+" : ""}{formatNumber(quote.regularMarketChangePercent)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4">
          <div className="flex gap-1 mb-4">
            {periods.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  period === p
                    ? "bg-[#0a8043] text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="relative">
            {chartLoading && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                <div className="text-gray-500 text-sm">Loading...</div>
              </div>
            )}
            {renderChart()}
          </div>
        </div>
      </div>

      {/* Key Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Key Statistics</h3>
        </div>
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          <div className="divide-y divide-gray-100">
            <div className="px-4 py-3 flex justify-between">
              <span className="text-xs text-gray-500">Previous Close</span>
              <span className="text-xs font-medium text-gray-900">{formatNumber(quote.regularMarketPreviousClose)}</span>
            </div>
            <div className="px-4 py-3 flex justify-between">
              <span className="text-xs text-gray-500">Open</span>
              <span className="text-xs font-medium text-gray-900">{formatNumber(quote.regularMarketOpen)}</span>
            </div>
            <div className="px-4 py-3 flex justify-between">
              <span className="text-xs text-gray-500">Day High</span>
              <span className="text-xs font-medium text-gray-900">{formatNumber(quote.regularMarketDayHigh)}</span>
            </div>
            <div className="px-4 py-3 flex justify-between">
              <span className="text-xs text-gray-500">Day Low</span>
              <span className="text-xs font-medium text-gray-900">{formatNumber(quote.regularMarketDayLow)}</span>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            <div className="px-4 py-3 flex justify-between">
              <span className="text-xs text-gray-500">Volume</span>
              <span className="text-xs font-medium text-gray-900">{formatLargeNumber(quote.regularMarketVolume)}</span>
            </div>
            <div className="px-4 py-3 flex justify-between">
              <span className="text-xs text-gray-500">Market Cap</span>
              <span className="text-xs font-medium text-gray-900">{formatLargeNumber(quote.marketCap)}</span>
            </div>
            <div className="px-4 py-3 flex justify-between">
              <span className="text-xs text-gray-500">52W High</span>
              <span className="text-xs font-medium text-gray-900">{formatNumber(quote.fiftyTwoWeekHigh)}</span>
            </div>
            <div className="px-4 py-3 flex justify-between">
              <span className="text-xs text-gray-500">52W Low</span>
              <span className="text-xs font-medium text-gray-900">{formatNumber(quote.fiftyTwoWeekLow)}</span>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-100 grid grid-cols-2 divide-x divide-gray-100">
          <div className="px-4 py-3 flex justify-between">
            <span className="text-xs text-gray-500">P/E Ratio</span>
            <span className="text-xs font-medium text-gray-900">{quote.trailingPE ? formatNumber(quote.trailingPE) : "-"}</span>
          </div>
          <div className="px-4 py-3 flex justify-between">
            <span className="text-xs text-gray-500">Dividend Yield</span>
            <span className="text-xs font-medium text-gray-900">{quote.dividendYield ? `${formatNumber(quote.dividendYield * 100)}%` : "-"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

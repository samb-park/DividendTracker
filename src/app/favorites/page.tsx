"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, TrendingUp, TrendingDown, Plus, X } from "lucide-react";

interface StockQuote {
  symbol: string;
  shortName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  currency: string;
}

async function fetchQuoteFromApi(symbol: string): Promise<StockQuote | null> {
  try {
    const res = await fetch(`/api/stock/quote?symbol=${symbol}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return {
      symbol: data.symbol,
      shortName: data.shortName,
      regularMarketPrice: data.regularMarketPrice,
      regularMarketChange: data.regularMarketChange,
      regularMarketChangePercent: data.regularMarketChangePercent,
      currency: data.currency,
    };
  } catch {
    return null;
  }
}

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [loading, setLoading] = useState(true);
  const [addSymbol, setAddSymbol] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    loadFavorites();

    // Listen for favorites changes
    const handleChange = () => loadFavorites();
    window.addEventListener("favoritesChange", handleChange);
    return () => window.removeEventListener("favoritesChange", handleChange);
  }, []);

  useEffect(() => {
    if (favorites.length > 0) {
      fetchQuotes();
    } else {
      setLoading(false);
    }
  }, [favorites]);

  function loadFavorites() {
    const saved = JSON.parse(localStorage.getItem("favoriteStocks") || "[]");
    setFavorites(saved);
  }

  async function fetchQuotes() {
    setLoading(true);
    const newQuotes: Record<string, StockQuote> = {};

    await Promise.all(
      favorites.map(async (symbol) => {
        const quote = await fetchQuoteFromApi(symbol);
        if (quote) {
          newQuotes[symbol] = quote;
        }
      })
    );

    setQuotes(newQuotes);
    setLoading(false);
  }

  function removeFavorite(symbol: string) {
    const newFavorites = favorites.filter((s) => s !== symbol);
    localStorage.setItem("favoriteStocks", JSON.stringify(newFavorites));
    setFavorites(newFavorites);
    window.dispatchEvent(new CustomEvent("favoritesChange"));
  }

  function addFavorite() {
    if (!addSymbol.trim()) return;
    const symbol = addSymbol.toUpperCase().trim();
    if (!favorites.includes(symbol)) {
      const newFavorites = [...favorites, symbol];
      localStorage.setItem("favoriteStocks", JSON.stringify(newFavorites));
      setFavorites(newFavorites);
      window.dispatchEvent(new CustomEvent("favoritesChange"));
    }
    setAddSymbol("");
    setShowAddForm(false);
  }

  function formatNumber(num: number | undefined, decimals = 2): string {
    if (num === undefined || num === null) return "-";
    return num.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div className="border-b border-gray-200 flex-1">
          <span className="pb-2 text-xs font-semibold tracking-wider text-[#0a8043] border-b-[3px] border-[#0a8043] inline-block">
            FAVORITES
          </span>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="ml-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <Plus className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Add Symbol Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Enter symbol (e.g., AAPL)"
              value={addSymbol}
              onChange={(e) => setAddSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && addFavorite()}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              autoFocus
            />
            <button
              onClick={addFavorite}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setAddSymbol("");
              }}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Favorites List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 animate-pulse">
              <div className="flex items-center justify-between">
                <div>
                  <div className="h-5 w-16 bg-gray-200 rounded mb-1" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
                <div className="text-right">
                  <div className="h-5 w-20 bg-gray-200 rounded mb-1" />
                  <div className="h-3 w-16 bg-gray-100 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
          <Star className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-gray-900 font-medium mb-1">No favorites yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            Add stocks to your favorites to track them here
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Add Your First Stock
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {favorites.map((symbol) => {
            const quote = quotes[symbol];
            const isPositive = quote && quote.regularMarketChange >= 0;

            return (
              <div
                key={symbol}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <Link
                  href={`/stock/${symbol}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <span className="text-xs font-bold text-gray-600">
                        {symbol.slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{symbol}</div>
                      <div className="text-xs text-gray-500 truncate max-w-[150px]">
                        {quote?.shortName || "Loading..."}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {quote ? (
                      <>
                        <div className="font-semibold text-gray-900">
                          {quote.currency === "USD" ? "$" : quote.currency === "CAD" ? "C$" : ""}
                          {formatNumber(quote.regularMarketPrice)}
                        </div>
                        <div
                          className={`flex items-center justify-end gap-1 text-xs ${
                            isPositive ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {isPositive ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          <span>
                            {isPositive ? "+" : ""}
                            {formatNumber(quote.regularMarketChangePercent)}%
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-gray-400">-</div>
                    )}
                  </div>
                </Link>
                <div className="border-t border-gray-100 px-4 py-2 flex justify-end">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      removeFavorite(symbol);
                    }}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

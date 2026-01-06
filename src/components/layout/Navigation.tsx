"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, BarChart3, Settings, DollarSign, Star, Search, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";

const navItems = [
  { href: "/", label: "HOME", icon: Home },
  { href: "/holdings", label: "HOLDINGS", icon: BarChart3 },
  { href: "/dividends", label: "DIVIDENDS", icon: DollarSign },
  { href: "/favorites", label: "FAVORITES", icon: Star },
  { href: "/settings", label: "SETTINGS", icon: Settings },
];

// Popular stock symbols for suggestions
const popularSymbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "SPY", "QQQ", "VTI"];

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    if (searchQuery.length > 0) {
      const filtered = popularSymbols.filter(s =>
        s.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSuggestions(filtered.slice(0, 5));
    } else {
      setSuggestions([]);
    }
  }, [searchQuery]);

  function handleSearch(symbol: string) {
    if (symbol.trim()) {
      router.push(`/stock/${symbol.toUpperCase()}`);
      setSearchOpen(false);
      setSearchQuery("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && searchQuery.trim()) {
      handleSearch(searchQuery);
    }
    if (e.key === "Escape") {
      setSearchOpen(false);
      setSearchQuery("");
    }
  }

  return (
    <>
      {/* Desktop Navigation - Top Bar */}
      <nav className="hidden md:block bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-10">
              {/* Logo / Search */}
              <div className="flex items-center gap-2">
                <Link href="/" className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0a8043] to-[#16a34a] flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                </Link>
                {/* Desktop Search */}
                <div className="relative">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full">
                    <Search className="w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search symbol..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="bg-transparent border-none outline-none text-sm w-32 placeholder-gray-400"
                    />
                  </div>
                  {suggestions.length > 0 && searchQuery && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
                      {suggestions.map((symbol) => (
                        <button
                          key={symbol}
                          onClick={() => handleSearch(symbol)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
                        >
                          {symbol}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop Menu */}
              <div className="flex items-center gap-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-[#0a8043]/10 text-[#0a8043]"
                          : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation - Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-gray-100">
        <div className="flex items-center justify-around h-14 px-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href === "/favorites" && pathname.startsWith("/stock"));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 ease-out",
                  isActive
                    ? "text-[#0a8043]"
                    : "text-gray-400 active:scale-95"
                )}
              >
                {/* Icon */}
                <Icon
                  className={cn(
                    "transition-all duration-300 ease-out",
                    isActive ? "w-5 h-5" : "w-[18px] h-[18px]"
                  )}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />

                {/* Label */}
                <span
                  className={cn(
                    "text-[9px] font-medium mt-0.5 transition-all duration-300 ease-out",
                    isActive
                      ? "opacity-100"
                      : "opacity-60"
                  )}
                >
                  {item.label.charAt(0) + item.label.slice(1).toLowerCase()}
                </span>
              </Link>
            );
          })}
        </div>
        {/* Safe area spacer */}
        <div className="pb-safe" />
      </nav>

      {/* Mobile Header - Search */}
      <header className="md:hidden bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="flex items-center justify-between h-14 px-4">
          {searchOpen ? (
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-full">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search symbol (e.g., AAPL)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-transparent border-none outline-none text-sm placeholder-gray-400"
                />
              </div>
              <button
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                }}
                className="p-2"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          ) : (
            <>
              <Link href="/" className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0a8043] to-[#16a34a] flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
                <span className="text-base font-semibold text-gray-900 tracking-tight">
                  Portfolio
                </span>
              </Link>
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <Search className="w-5 h-5 text-gray-600" />
              </button>
            </>
          )}
        </div>
        {/* Mobile Search Suggestions */}
        {searchOpen && suggestions.length > 0 && (
          <div className="absolute left-4 right-4 top-14 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
            {suggestions.map((symbol) => (
              <button
                key={symbol}
                onClick={() => handleSearch(symbol)}
                className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 transition-colors flex items-center gap-3"
              >
                <Search className="w-4 h-4 text-gray-400" />
                <span className="font-medium">{symbol}</span>
              </button>
            ))}
          </div>
        )}
      </header>
    </>
  );
}

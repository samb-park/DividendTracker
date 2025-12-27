"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoldingsTable,
  type ColumnKey,
} from "@/components/holdings/holdings-table";
import { PortfolioHeader } from "@/components/holdings/portfolio-header";
import {
  HoldingCardsList,
  type ReturnDisplayMode,
} from "@/components/holdings/holding-card";
import { cn } from "@/lib/utils";
import type { HoldingWithPrice } from "@/types";

interface Account {
  id: string;
  name: string;
  broker: string;
}

type CurrencyFilter = "all" | "CAD" | "USD";
type DisplayCurrency = "CAD" | "USD";

// Default visible columns
const DEFAULT_COLUMNS: ColumnKey[] = [
  "shares",
  "avgCost",
  "price",
  "value",
  "pl",
  "weight",
];

// Simplified exchange rate (in real app, would fetch from API)
const EXCHANGE_RATES = {
  CAD_TO_USD: 0.74,
  USD_TO_CAD: 1.35,
};

export default function HoldingsPage() {
  const router = useRouter();
  const [holdings, setHoldings] = useState<HoldingWithPrice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] =
    useState<string>("all-combined");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("all");
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("CAD");
  const [returnMode, setReturnMode] = useState<ReturnDisplayMode>("all_time");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    () => new Set(DEFAULT_COLUMNS)
  );

  // Load column preferences from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("holdings-columns");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ColumnKey[];
        setVisibleColumns(new Set(parsed));
      } catch {
        // Use defaults if parse fails
      }
    }
  }, []);

  // Save column preferences to localStorage
  const handleToggleColumn = useCallback((key: ColumnKey) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      localStorage.setItem("holdings-columns", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data);
    } catch (err) {
      console.error("Failed to fetch accounts:", err);
    }
  };

  const fetchHoldings = async (showRefreshing = false, forceRefresh = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (selectedAccount === "all-combined") {
        params.set("aggregate", "true");
      } else if (selectedAccount !== "all-separate") {
        params.set("accountId", selectedAccount);
      }
      if (forceRefresh) {
        params.set("refresh", "true");
      }
      const url = `/api/holdings${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setHoldings(data);
    } catch (err) {
      console.error("Failed to fetch holdings:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchHoldings();
  }, [selectedAccount]);

  const handleRowClick = (ticker: string) => {
    router.push(`/search?q=${ticker}`);
  };

  // Filter holdings by currency
  const filteredHoldings = holdings.filter((holding) => {
    if (currencyFilter === "all") return true;
    return holding.currency === currencyFilter;
  });

  // Convert holdings for header total calculation based on displayCurrency
  const convertedHoldings: HoldingWithPrice[] = filteredHoldings.map(
    (holding) => {
      const convertValue = (val: string | undefined, rate: number) => {
        if (!val) return val;
        const num = parseFloat(val);
        if (isNaN(num)) return val;
        return (num * rate).toFixed(2);
      };

      // Convert to target display currency
      if (displayCurrency === "CAD" && holding.currency === "USD") {
        const rate = EXCHANGE_RATES.USD_TO_CAD;
        return {
          ...holding,
          marketValue: convertValue(holding.marketValue, rate),
          profitLoss: convertValue(holding.profitLoss, rate),
          dailyChange: convertValue(holding.dailyChange, rate),
        };
      }
      if (displayCurrency === "USD" && holding.currency === "CAD") {
        const rate = EXCHANGE_RATES.CAD_TO_USD;
        return {
          ...holding,
          marketValue: convertValue(holding.marketValue, rate),
          profitLoss: convertValue(holding.profitLoss, rate),
          dailyChange: convertValue(holding.dailyChange, rate),
        };
      }
      return holding;
    }
  );

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="text-center space-y-2">
          <Skeleton className="h-4 w-24 mx-auto" />
          <Skeleton className="h-10 w-40 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-8 w-48 mx-auto" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Portfolio Header with Chart */}
      {holdings.length > 0 && (
        <PortfolioHeader
          holdings={convertedHoldings}
          currency={displayCurrency}
          onCurrencyChange={setDisplayCurrency}
        />
      )}

      {/* Holdings Section Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Holdings</h2>
        <div className="flex items-center gap-2">
          {/* Return Mode Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                {returnMode === "all_time" ? "All time return" : "Daily change"}
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setReturnMode("all_time")}>
                All time return
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setReturnMode("daily")}>
                Daily change
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchHoldings(true, true)}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Currency Filter Tabs */}
      <div className="flex gap-2">
        {(["all", "CAD", "USD"] as CurrencyFilter[]).map((filter) => (
          <button
            key={filter}
            onClick={() => setCurrencyFilter(filter)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-full transition-colors",
              currencyFilter === filter
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {filter === "all" ? "All" : filter}
          </button>
        ))}
      </div>

      {/* Account Filter (Desktop) */}
      <div className="hidden md:flex gap-2">
        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-combined">All (Combined)</SelectItem>
            <SelectItem value="all-separate">All (Separate)</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredHoldings.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No holdings found</p>
        </div>
      ) : (
        <>
          {/* Desktop: Table view */}
          <div className="hidden md:block">
            <HoldingsTable
              holdings={filteredHoldings}
              onRowClick={handleRowClick}
              visibleColumns={visibleColumns}
              onToggleColumn={handleToggleColumn}
            />
          </div>

          {/* Mobile: Card view */}
          <div className="md:hidden">
            <HoldingCardsList
              holdings={filteredHoldings}
              onCardClick={handleRowClick}
              returnMode={returnMode}
            />
          </div>
        </>
      )}
    </div>
  );
}

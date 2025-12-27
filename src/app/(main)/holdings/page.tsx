"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
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
  HoldingsTable,
  HoldingsCards,
  type ColumnKey,
} from "@/components/holdings/holdings-table";
import type { HoldingWithPrice } from "@/types";

interface Account {
  id: string;
  name: string;
  broker: string;
}

type DisplayCurrency = "original" | "CAD" | "USD";

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
  const [displayCurrency, setDisplayCurrency] =
    useState<DisplayCurrency>("original");
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

  const fetchHoldings = async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      let url = "/api/holdings";
      if (selectedAccount === "all-combined") {
        url += "?aggregate=true";
      } else if (selectedAccount !== "all-separate") {
        url += `?accountId=${selectedAccount}`;
      }
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

  // Convert holdings to display currency
  const convertedHoldings: HoldingWithPrice[] = holdings.map((holding) => {
    if (displayCurrency === "original") return holding;

    const holdingCurrency = holding.currency;
    const targetCurrency = displayCurrency;

    if (holdingCurrency === targetCurrency) return holding;

    // Determine conversion rate
    let rate = 1;
    if (holdingCurrency === "USD" && targetCurrency === "CAD") {
      rate = EXCHANGE_RATES.USD_TO_CAD;
    } else if (holdingCurrency === "CAD" && targetCurrency === "USD") {
      rate = EXCHANGE_RATES.CAD_TO_USD;
    }

    const convertValue = (val: string | undefined) => {
      if (!val) return val;
      const num = parseFloat(val);
      if (isNaN(num)) return val;
      return (num * rate).toFixed(2);
    };

    return {
      ...holding,
      currency: targetCurrency,
      avgCost: convertValue(holding.avgCost) || holding.avgCost,
      currentPrice: convertValue(holding.currentPrice),
      marketValue: convertValue(holding.marketValue),
      profitLoss: convertValue(holding.profitLoss),
      fiftyTwoWeekHigh: convertValue(holding.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: convertValue(holding.fiftyTwoWeekLow),
    };
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Holdings</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fetchHoldings(true)}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
          <SelectTrigger className="w-full sm:w-[200px]">
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

        <Select
          value={displayCurrency}
          onValueChange={(v) => setDisplayCurrency(v as DisplayCurrency)}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="original">Original</SelectItem>
            <SelectItem value="CAD">CAD</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {holdings.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No holdings found</p>
        </div>
      ) : (
        <>
          {/* Desktop: Table view */}
          <div className="hidden md:block">
            <HoldingsTable
              holdings={convertedHoldings}
              onRowClick={handleRowClick}
              visibleColumns={visibleColumns}
              onToggleColumn={handleToggleColumn}
            />
          </div>

          {/* Mobile: Card view */}
          <div className="md:hidden">
            <HoldingsCards
              holdings={convertedHoldings}
              onRowClick={handleRowClick}
              visibleColumns={visibleColumns}
            />
          </div>
        </>
      )}
    </div>
  );
}

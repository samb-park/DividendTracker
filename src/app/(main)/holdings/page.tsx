"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  type MobileCardField,
} from "@/components/holdings/holding-card";
import { cn } from "@/lib/utils";
import type { HoldingWithPrice } from "@/types";

// Exchange rates for currency conversion
const EXCHANGE_RATES = {
  USD_TO_CAD: 1.35,
  CAD_TO_USD: 0.74,
};

type DisplayCurrency = "CAD" | "USD";

// Mobile card display fields configuration
const ALL_MOBILE_FIELDS: { key: MobileCardField; label: string }[] = [
  { key: "avgCost", label: "Avg Cost" },
  { key: "currentPrice", label: "Current Price" },
  { key: "fiftyTwoWeekHigh", label: "52W High" },
  { key: "fiftyTwoWeekLow", label: "52W Low" },
  { key: "today", label: "Today" },
  { key: "dividendYield", label: "Dividend Yield" },
  { key: "weight", label: "Weight" },
  { key: "allTimeReturn", label: "All Time Return" },
  { key: "shares", label: "Shares" },
  { key: "marketValue", label: "Market Value" },
];

const DEFAULT_MOBILE_FIELDS: MobileCardField[] = [
  "avgCost",
  "currentPrice",
  "fiftyTwoWeekHigh",
  "fiftyTwoWeekLow",
  "today",
];

interface Account {
  id: string;
  name: string;
  broker: string;
}

type CurrencyFilter = "all" | "CAD" | "USD";

// Default visible columns
const DEFAULT_COLUMNS: ColumnKey[] = [
  "shares",
  "avgCost",
  "price",
  "value",
  "pl",
  "weight",
];

export default function HoldingsPage() {
  const router = useRouter();
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("CAD");
  const [holdings, setHoldings] = useState<HoldingWithPrice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] =
    useState<string>("all-combined");
  const [isLoading, setIsLoading] = useState(true);
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("all");
  const [returnMode, setReturnMode] = useState<ReturnDisplayMode>("all_time");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    () => new Set(DEFAULT_COLUMNS)
  );
  const [visibleMobileFields, setVisibleMobileFields] = useState<Set<MobileCardField>>(
    () => new Set(DEFAULT_MOBILE_FIELDS)
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

    // Load mobile field preferences
    const savedMobile = localStorage.getItem("mobile-card-fields");
    if (savedMobile) {
      try {
        const parsed = JSON.parse(savedMobile) as MobileCardField[];
        setVisibleMobileFields(new Set(parsed));
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

  // Save mobile field preferences to localStorage
  const handleToggleMobileField = useCallback((key: MobileCardField) => {
    setVisibleMobileFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      localStorage.setItem("mobile-card-fields", JSON.stringify([...next]));
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

  const fetchHoldings = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedAccount === "all-combined") {
        params.set("aggregate", "true");
      } else if (selectedAccount !== "all-separate") {
        params.set("accountId", selectedAccount);
      }
      const url = `/api/holdings${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setHoldings(data);
    } catch (err) {
      console.error("Failed to fetch holdings:", err);
    } finally {
      setIsLoading(false);
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
    router.push(`/stock/${ticker}`);
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

          {/* Mobile Settings Button */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5 text-sm font-semibold">
                  Display Fields
                </div>
                {ALL_MOBILE_FIELDS.map((field) => (
                  <label
                    key={field.key}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-muted"
                  >
                    <Checkbox
                      checked={visibleMobileFields.has(field.key)}
                      onCheckedChange={() => handleToggleMobileField(field.key)}
                    />
                    {field.label}
                  </label>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
              displayCurrency={displayCurrency}
            />
          </div>

          {/* Mobile: Card view */}
          <div className="md:hidden">
            <HoldingCardsList
              holdings={filteredHoldings}
              onCardClick={handleRowClick}
              returnMode={returnMode}
              visibleFields={visibleMobileFields}
              displayCurrency={displayCurrency}
            />
          </div>
        </>
      )}
    </div>
  );
}

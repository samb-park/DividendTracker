"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/search/search-input";
import { QuoteCard } from "@/components/search/quote-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { QuoteData } from "@/types";

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuote = async (ticker: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search?q=" + encodeURIComponent(ticker) + "&mode=quote");
      if (!res.ok) {
        if (res.status === 404) {
          setError("Ticker not found");
          setQuote(null);
          return;
        }
        throw new Error("Failed to fetch quote");
      }
      const data = await res.json();
      setQuote(data);
    } catch {
      setError("Failed to fetch quote");
      setQuote(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery) {
      fetchQuote(initialQuery);
    }
  }, [initialQuery]);

  const handleSelect = (symbol: string) => {
    router.push(`/stock/${symbol}`);
  };

  const handleAddToPortfolio = () => {
    if (quote) {
      router.push("/transactions/new?ticker=" + quote.ticker);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Search</h1>

      <SearchInput onSelect={handleSelect} />

      {error && (
        <div className="p-4 text-center text-muted-foreground">
          {error}
        </div>
      )}

      {(isLoading || quote) && (
        <QuoteCard
          quote={quote}
          isLoading={isLoading}
          onAddToPortfolio={handleAddToPortfolio}
        />
      )}

      {!isLoading && !quote && !error && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Search for any stock or ETF by ticker symbol</p>
          <p className="text-sm mt-1">
            Examples: AAPL, MSFT, VTI, XIU.TO
          </p>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-12" />
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}

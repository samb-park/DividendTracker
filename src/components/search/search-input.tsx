"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/types";

interface SearchInputProps {
  onSelect: (symbol: string) => void;
  placeholder?: string;
}

export function SearchInput({
  onSelect,
  placeholder = "Search ticker or company...",
}: SearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      return;
    }

    // Debounce search
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&mode=search`
        );
        const data = await res.json();
        setResults(data.results || []);
      } catch (err) {
        console.error("Search failed:", err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query]);

  const handleSelect = (symbol: string) => {
    setQuery(symbol);
    setShowResults(false);
    onSelect(symbol);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          className="pl-10 pr-10"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {results.map((result) => (
            <button
              key={result.symbol}
              className={cn(
                "w-full px-4 py-3 text-left hover:bg-muted",
                "flex items-center justify-between"
              )}
              onClick={() => handleSelect(result.symbol)}
            >
              <div>
                <span className="font-medium">{result.symbol}</span>
                <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {result.name}
                </p>
              </div>
              {result.exchange && (
                <span className="text-xs text-muted-foreground">
                  {result.exchange}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {showResults && query.length > 0 && results.length === 0 && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg p-4 text-center text-muted-foreground">
          No results found
        </div>
      )}
    </div>
  );
}

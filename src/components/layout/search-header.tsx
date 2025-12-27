"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";
import type { SearchResult } from "@/types";

export function SearchHeader() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Search when query changes
  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      return;
    }

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

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
        if (query.length === 0) {
          setIsExpanded(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [query]);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  const handleSelect = (symbol: string) => {
    setQuery("");
    setShowResults(false);
    setIsExpanded(false);
    router.push(`/stock/${symbol}`);
  };

  const handleClose = () => {
    setQuery("");
    setResults([]);
    setShowResults(false);
    setIsExpanded(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-background border-b">
      <div className="px-4 py-3 flex items-center justify-end gap-2">
        <div ref={containerRef} className="relative">
          {isExpanded ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Search ticker..."
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowResults(true);
                  }}
                  onFocus={() => setShowResults(true)}
                  className="pl-10 pr-10 h-9 w-64 bg-muted/50"
                />
                {isLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={handleClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsExpanded(true)}
            >
              <Search className="h-4 w-4" />
            </Button>
          )}

          {isExpanded && showResults && results.length > 0 && (
            <div className="absolute right-0 z-50 w-64 mt-1 bg-background border rounded-lg shadow-lg max-h-64 overflow-y-auto">
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
                    <p className="text-sm text-muted-foreground truncate max-w-[150px]">
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

          {isExpanded && showResults && query.length > 0 && results.length === 0 && !isLoading && (
            <div className="absolute right-0 z-50 w-64 mt-1 bg-background border rounded-lg shadow-lg p-4 text-center text-muted-foreground text-sm">
              No results found
            </div>
          )}
        </div>
        <UserMenu />
      </div>
    </header>
  );
}

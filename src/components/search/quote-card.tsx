"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuoteData } from "@/types";

interface QuoteCardProps {
  quote: QuoteData | null;
  isLoading?: boolean;
  onAddToPortfolio?: () => void;
}

export function QuoteCard({ quote, isLoading, onAddToPortfolio }: QuoteCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!quote) {
    return null;
  }

  const priceChange = quote.previousClose
    ? quote.price - quote.previousClose
    : 0;
  const priceChangePercent = quote.previousClose
    ? (priceChange / quote.previousClose) * 100
    : 0;
  const isPositive = priceChange >= 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl">{quote.ticker}</CardTitle>
            {quote.name && (
              <p className="text-sm text-muted-foreground">{quote.name}</p>
            )}
          </div>
          <Badge variant="outline">{quote.currency}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold">${quote.price.toFixed(2)}</span>
          {quote.previousClose && (
            <div className="flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span
                className={cn(
                  "font-medium",
                  isPositive ? "text-green-600" : "text-red-600"
                )}
              >
                {isPositive ? "+" : ""}
                {priceChange.toFixed(2)} ({isPositive ? "+" : ""}
                {priceChangePercent.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {quote.previousClose && (
            <div>
              <span className="text-muted-foreground">Prev Close</span>
              <p className="font-medium">${quote.previousClose.toFixed(2)}</p>
            </div>
          )}
          {quote.dividendYield !== undefined && (
            <div>
              <span className="text-muted-foreground">Dividend Yield</span>
              <p className="font-medium">{quote.dividendYield.toFixed(2)}%</p>
            </div>
          )}
          {quote.exchange && (
            <div>
              <span className="text-muted-foreground">Exchange</span>
              <p className="font-medium">{quote.exchange}</p>
            </div>
          )}
        </div>

        {onAddToPortfolio && (
          <Button onClick={onAddToPortfolio} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add to Portfolio
          </Button>
        )}

        {quote.cached && (
          <p className="text-xs text-muted-foreground text-center">
            Cached price data
          </p>
        )}
      </CardContent>
    </Card>
  );
}

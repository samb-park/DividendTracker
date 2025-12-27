"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PortfolioSummaryCardProps {
  title: string;
  value: string;
  currency?: string;
  change?: string;
  changePercent?: string;
  subtitle?: string;
}

export function PortfolioSummaryCard({
  title,
  value,
  currency,
  change,
  changePercent,
  subtitle,
}: PortfolioSummaryCardProps) {
  const isPositive = change ? parseFloat(change) >= 0 : true;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">${value}</span>
          {currency && (
            <span className="text-sm text-muted-foreground">{currency}</span>
          )}
        </div>
        {change && (
          <div className="mt-1 flex items-center gap-2">
            <span
              className={cn(
                "text-sm font-medium",
                isPositive ? "text-green-600" : "text-red-600"
              )}
            >
              {isPositive ? "+" : ""}
              {change}
            </span>
            {changePercent && (
              <Badge
                variant={isPositive ? "default" : "destructive"}
                className="text-xs"
              >
                {isPositive ? "+" : ""}
                {changePercent}%
              </Badge>
            )}
          </div>
        )}
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

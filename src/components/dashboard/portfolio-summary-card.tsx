"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TrendingUp, Calendar, type LucideIcon } from "lucide-react";

interface PortfolioSummaryCardProps {
  title: string;
  value: string;
  currency?: string;
  change?: string;
  changePercent?: string;
  subtitle?: string;
  variant?: "default" | "hero";
  icon?: LucideIcon;
}

export function PortfolioSummaryCard({
  title,
  value,
  currency,
  change,
  changePercent,
  subtitle,
  variant = "default",
  icon: Icon,
}: PortfolioSummaryCardProps) {
  const isPositive = change ? parseFloat(change) >= 0 : true;

  return (
    <Card
      className={cn(
        variant === "hero" &&
          "bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20"
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon className="h-4 w-4 text-muted-foreground" />
          )}
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "font-bold",
              variant === "hero" ? "text-3xl" : "text-2xl"
            )}
          >
            ${value}
          </span>
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

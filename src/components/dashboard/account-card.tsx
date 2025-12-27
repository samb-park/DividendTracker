"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AccountSummary } from "@/types";

interface AccountCardProps {
  account: AccountSummary;
}

export function AccountCard({ account }: AccountCardProps) {
  const isPositive = parseFloat(account.profitLoss) >= 0;

  return (
    <Link href={`/accounts/${account.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">
              {account.name}
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {account.broker}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-xl font-bold">${account.totalValue}</span>
              <span className="ml-1 text-sm text-muted-foreground">
                {account.currency}
              </span>
            </div>
            <div className="text-right">
              <span
                className={cn(
                  "text-sm font-medium",
                  isPositive ? "text-green-600" : "text-red-600"
                )}
              >
                {isPositive ? "+" : ""}${account.profitLoss}
              </span>
              <Badge
                variant={isPositive ? "default" : "destructive"}
                className="ml-2 text-xs"
              >
                {isPositive ? "+" : ""}
                {account.profitLossPercent}%
              </Badge>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {account.holdingsCount} holdings
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PortfolioSummaryCard } from "@/components/dashboard/portfolio-summary-card";
import { AccountCard } from "@/components/dashboard/account-card";
import type { DashboardData } from "@/types";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch dashboard:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center">
        <p>Failed to load dashboard</p>
        <Button onClick={() => fetchData()} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  const hasCAD = parseFloat(data.totals.CAD.value) > 0;
  const hasUSD = parseFloat(data.totals.USD.value) > 0;

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fetchData(true)}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {hasCAD && (
          <PortfolioSummaryCard
            title="CAD Portfolio"
            value={data.totals.CAD.value}
            currency="CAD"
            change={data.totals.CAD.pl}
            changePercent={
              parseFloat(data.totals.CAD.cost) > 0
                ? (
                    (parseFloat(data.totals.CAD.pl) /
                      parseFloat(data.totals.CAD.cost)) *
                    100
                  ).toFixed(2)
                : "0"
            }
          />
        )}
        {hasUSD && (
          <PortfolioSummaryCard
            title="USD Portfolio"
            value={data.totals.USD.value}
            currency="USD"
            change={data.totals.USD.pl}
            changePercent={
              parseFloat(data.totals.USD.cost) > 0
                ? (
                    (parseFloat(data.totals.USD.pl) /
                      parseFloat(data.totals.USD.cost)) *
                    100
                  ).toFixed(2)
                : "0"
            }
          />
        )}
        {!hasCAD && !hasUSD && (
          <div className="col-span-2 text-center py-8 text-muted-foreground">
            <p>No holdings yet</p>
            <p className="text-sm">Add an account and transactions to get started</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <PortfolioSummaryCard
          title="YTD Dividends"
          value={data.ytdDividends.split(" / ")[0].replace("CAD ", "")}
          subtitle={data.ytdDividends}
        />
        <PortfolioSummaryCard
          title="Expected Annual"
          value={data.expectedAnnualDividend.split(" / ")[0].replace("CAD ", "")}
          subtitle={data.expectedAnnualDividend}
        />
      </div>

      {data.accounts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Accounts</h2>
          {data.accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  );
}

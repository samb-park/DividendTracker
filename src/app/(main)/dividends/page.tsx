"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface DividendSummary {
  expected: {
    annualCAD: string;
    annualUSD: string;
    monthlyCAD: string;
    monthlyUSD: string;
  };
  ytd: {
    CAD: string;
    USD: string;
  };
  history: Array<{
    month: string;
    CAD: string;
    USD: string;
  }>;
}

export default function DividendsPage() {
  const [data, setData] = useState<DividendSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/dividends");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Failed to fetch dividends:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Failed to load dividend data
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold">Dividends</h1>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              YTD Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-2xl font-bold">${data.ytd.CAD}</p>
              <p className="text-sm text-muted-foreground">CAD</p>
            </div>
            {parseFloat(data.ytd.USD) > 0 && (
              <div className="mt-2">
                <p className="text-lg font-semibold">${data.ytd.USD}</p>
                <p className="text-sm text-muted-foreground">USD</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expected Annual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-2xl font-bold">${data.expected.annualCAD}</p>
              <p className="text-sm text-muted-foreground">CAD</p>
            </div>
            {parseFloat(data.expected.annualUSD) > 0 && (
              <div className="mt-2">
                <p className="text-lg font-semibold">${data.expected.annualUSD}</p>
                <p className="text-sm text-muted-foreground">USD</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Expected</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-bold">${data.expected.monthlyCAD}</p>
              <p className="text-sm text-muted-foreground">CAD / month</p>
            </div>
            {parseFloat(data.expected.monthlyUSD) > 0 && (
              <div>
                <p className="text-3xl font-bold">${data.expected.monthlyUSD}</p>
                <p className="text-sm text-muted-foreground">USD / month</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {data.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.history.map((item) => (
                <div
                  key={item.month}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <span className="text-muted-foreground">{item.month}</span>
                  <div className="flex gap-4">
                    <span className="font-mono">${item.CAD} CAD</span>
                    {parseFloat(item.USD) > 0 && (
                      <span className="font-mono">${item.USD} USD</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountWithCounts } from "@/types";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data);
    } catch (err) {
      console.error("Failed to fetch accounts:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <Link href="/accounts/new">
          <Button size="icon">
            <Plus className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No accounts yet</p>
          <Link href="/accounts/new">
            <Button className="mt-4">Create your first account</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <Link key={account.id} href={`/accounts/${account.id}`}>
              <div className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{account.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {account._count.holdings} holdings ·{" "}
                      {account._count.transactions} transactions
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{account.broker}</Badge>
                    <Badge>{account.currency}</Badge>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

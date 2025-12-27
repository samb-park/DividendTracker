"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Transaction {
  id: string;
  ticker: string;
  type: string;
  quantity: string;
  price: string;
  fee: string;
  tradeDate: string;
  note?: string;
  account: {
    name: string;
    broker: string;
    currency: string;
  };
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function fetchTransactions() {
      try {
        const res = await fetch("/api/transactions?limit=100");
        const data = await res.json();
        setTransactions(data.transactions);
        setTotal(data.total);
      } catch (err) {
        console.error("Failed to fetch transactions:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchTransactions();
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  const typeColors: Record<string, string> = {
    BUY: "bg-green-100 text-green-800",
    SELL: "bg-red-100 text-red-800",
    DIVIDEND_CASH: "bg-blue-100 text-blue-800",
    DIVIDEND_DRIP: "bg-purple-100 text-purple-800",
    TRANSFER_IN: "bg-yellow-100 text-yellow-800",
    TRANSFER_OUT: "bg-orange-100 text-orange-800",
    SPLIT: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-sm text-muted-foreground">{total} total</p>
        </div>
        <Link href="/transactions/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </Link>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No transactions yet</p>
          <Link href="/transactions/new">
            <Button className="mt-4">Add your first transaction</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => {
            const amount =
              parseFloat(tx.quantity) * parseFloat(tx.price) +
              parseFloat(tx.fee || "0");
            const isBuy = tx.type === "BUY" || tx.type === "TRANSFER_IN";

            return (
              <div
                key={tx.id}
                className="p-4 rounded-lg border bg-card space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{tx.ticker}</span>
                      <Badge className={cn("text-xs", typeColors[tx.type])}>
                        {tx.type.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {tx.account.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        "font-bold",
                        isBuy ? "text-red-600" : "text-green-600"
                      )}
                    >
                      {isBuy ? "-" : "+"}${amount.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tx.quantity} @ ${parseFloat(tx.price).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {format(new Date(tx.tradeDate), "MMM d, yyyy")}
                  </span>
                  {tx.note && <span className="truncate max-w-[150px]">{tx.note}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

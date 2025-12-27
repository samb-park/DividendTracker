"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { toast } from "sonner";

interface Account {
  id: string;
  name: string;
  broker: string;
  currency: string;
}

function NewTransactionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTicker = searchParams.get("ticker") || "";
  const defaultAccountId = searchParams.get("accountId") || undefined;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch("/api/accounts");
        const data = await res.json();
        setAccounts(data);
      } catch (err) {
        console.error("Failed to fetch accounts:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchAccounts();
  }, []);

  const handleSuccess = () => {
    toast.success("Transaction added");
    router.push("/transactions");
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            You need to create an account first
          </p>
          <Button onClick={() => router.push("/accounts/new")} className="mt-4">
            Create Account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">Add Transaction</h1>
      </div>

      <TransactionForm
        accounts={accounts}
        defaultTicker={defaultTicker}
        defaultAccountId={defaultAccountId}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

export default function NewTransactionPage() {
  return (
    <Suspense fallback={
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    }>
      <NewTransactionContent />
    </Suspense>
  );
}

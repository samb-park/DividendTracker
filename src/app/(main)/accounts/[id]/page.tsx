"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, RefreshCw, Link2, Link2Off, Trash2, Key, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { QuestradeAccount } from "@/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface AccountDetail {
  id: string;
  name: string;
  broker: string;
  currency: string;
  questradeAccountNumber: string | null;
  lastSyncedAt: string | null;
  questradeToken: { id: string } | null;
  _count: {
    holdings: number;
    transactions: number;
  };
}

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = params.id as string;

  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [refreshToken, setRefreshToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [questradeAccounts, setQuestradeAccounts] = useState<QuestradeAccount[]>([]);
  const [selectedQtAccounts, setSelectedQtAccounts] = useState<Set<string>>(new Set());
  const [isLoadingQtAccounts, setIsLoadingQtAccounts] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const fetchAccount = async () => {
    try {
      const res = await fetch(`/api/accounts/${accountId}`);
      if (!res.ok) throw new Error("Account not found");
      const data = await res.json();
      setAccount(data);
    } catch (err) {
      console.error("Failed to fetch account:", err);
      toast.error("Failed to load account");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccount();
  }, [accountId]);

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === "questrade_connected") {
      toast.success("Questrade connected successfully!");
      fetchAccount();
    } else if (error) {
      toast.error(`Error: ${error.replace(/_/g, " ")}`);
    }
  }, [searchParams]);

  const handleConnectQuestrade = () => {
    window.location.href = `/api/questrade/auth?accountId=${accountId}`;
  };

  const fetchQuestradeAccounts = async () => {
    setIsLoadingQtAccounts(true);
    try {
      const res = await fetch(`/api/questrade/accounts?accountId=${accountId}`);
      if (!res.ok) throw new Error("Failed to fetch accounts");
      const data = await res.json();
      setQuestradeAccounts(data.accounts || []);
    } catch (err) {
      console.error("Failed to fetch Questrade accounts:", err);
      toast.error("Failed to fetch Questrade accounts");
    } finally {
      setIsLoadingQtAccounts(false);
    }
  };

  const handleConnectWithToken = async () => {
    if (!refreshToken.trim()) {
      toast.error("Please enter a refresh token");
      return;
    }

    setIsConnecting(true);
    try {
      const res = await fetch("/api/questrade/connect-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, refreshToken: refreshToken.trim() }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to connect");
      }

      toast.success("Questrade connected! Select accounts to import.");
      setShowTokenInput(false);
      setRefreshToken("");
      fetchAccount();
      // Fetch Questrade accounts for selection
      setTimeout(() => fetchQuestradeAccounts(), 500);
    } catch (err) {
      console.error("Failed to connect:", err);
      toast.error(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleToggleQtAccount = (accountNumber: string) => {
    const newSelected = new Set(selectedQtAccounts);
    if (newSelected.has(accountNumber)) {
      newSelected.delete(accountNumber);
    } else {
      newSelected.add(accountNumber);
    }
    setSelectedQtAccounts(newSelected);
  };

  const handleImportAccounts = async () => {
    if (selectedQtAccounts.size === 0) {
      toast.error("Please select at least one account");
      return;
    }

    setIsImporting(true);
    try {
      const selectedData = questradeAccounts
        .filter((a) => selectedQtAccounts.has(a.number))
        .map((a) => ({
          number: a.number,
          type: a.type,
          currency: "CAD", // Questrade accounts are typically CAD
        }));

      const res = await fetch("/api/questrade/import-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceAccountId: accountId,
          selectedAccounts: selectedData,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to import");
      }

      const result = await res.json();
      toast.success(`Imported ${result.count} account(s)!`);
      setQuestradeAccounts([]);
      setSelectedQtAccounts(new Set());
      router.push("/accounts");
    } catch (err) {
      console.error("Failed to import:", err);
      toast.error(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setIsImporting(false);
    }
  };

  const handleDisconnectQuestrade = async () => {
    try {
      const res = await fetch("/api/questrade/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      if (!res.ok) throw new Error("Failed to disconnect");

      toast.success("Questrade disconnected");
      fetchAccount();
    } catch (err) {
      console.error("Failed to disconnect:", err);
      toast.error("Failed to disconnect Questrade");
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/questrade/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          questradeAccountNumber: account?.questradeAccountNumber,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Sync failed");
      }

      const result = await res.json();
      toast.success(
        `Synced! ${result.holdingsCount} holdings, ${result.transactionsImported} new transactions`
      );
      fetchAccount();
    } catch (err) {
      console.error("Failed to sync:", err);
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete");

      toast.success("Account deleted");
      router.push("/accounts");
    } catch (err) {
      console.error("Failed to delete:", err);
      toast.error("Failed to delete account");
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground">Account not found</p>
        <Button variant="ghost" onClick={() => router.push("/accounts")}>
          Back to accounts
        </Button>
      </div>
    );
  }

  const isQuestradeConnected = !!account.questradeToken;
  const isQuestradeAccount = account.broker === "QUESTRADE";

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{account.name}</h1>
          <div className="flex gap-2 mt-1">
            <Badge variant="outline">{account.broker}</Badge>
            <Badge>{account.currency}</Badge>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-lg border bg-card">
        <h2 className="font-semibold mb-3">Account Summary</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Holdings</p>
            <p className="font-medium">{account._count.holdings}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Transactions</p>
            <p className="font-medium">{account._count.transactions}</p>
          </div>
        </div>
      </div>

      {isQuestradeAccount && (
        <div className="p-4 rounded-lg border bg-card">
          <h2 className="font-semibold mb-3">Questrade Integration</h2>

          {isQuestradeConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-600">
                  Connected
                </Badge>
                {account.questradeAccountNumber && (
                  <span className="text-sm text-muted-foreground">
                    Account #{account.questradeAccountNumber}
                  </span>
                )}
              </div>

              {account.lastSyncedAt && (
                <p className="text-sm text-muted-foreground">
                  Last synced:{" "}
                  {new Date(account.lastSyncedAt).toLocaleString()}
                </p>
              )}

              <div className="flex gap-2 flex-wrap">
                <Button onClick={handleSync} disabled={isSyncing}>
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`}
                  />
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </Button>

                <Button
                  variant="outline"
                  onClick={fetchQuestradeAccounts}
                  disabled={isLoadingQtAccounts}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Import More Accounts
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline">
                      <Link2Off className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect Questrade?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove the connection to Questrade. Your
                        existing data will be kept. You can reconnect anytime.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDisconnectQuestrade}>
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {/* Questrade Account Selection */}
              {questradeAccounts.length > 0 && (
                <div className="mt-4 p-4 border rounded-lg bg-muted/50">
                  <h3 className="font-medium mb-3">Select Accounts to Import</h3>
                  <div className="space-y-2">
                    {questradeAccounts.map((qtAccount) => (
                      <label
                        key={qtAccount.number}
                        className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedQtAccounts.has(qtAccount.number)}
                          onCheckedChange={() => handleToggleQtAccount(qtAccount.number)}
                        />
                        <div className="flex-1">
                          <p className="font-medium">{qtAccount.type}</p>
                          <p className="text-sm text-muted-foreground">
                            Account #{qtAccount.number}
                          </p>
                        </div>
                        {qtAccount.isPrimary && (
                          <Badge variant="secondary">Primary</Badge>
                        )}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      onClick={handleImportAccounts}
                      disabled={isImporting || selectedQtAccounts.size === 0}
                    >
                      <Check className="h-4 w-4 mr-2" />
                      {isImporting ? "Importing..." : `Import ${selectedQtAccounts.size} Account(s)`}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQuestradeAccounts([]);
                        setSelectedQtAccounts(new Set());
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {isLoadingQtAccounts && (
                <div className="mt-4 p-4 border rounded-lg">
                  <Skeleton className="h-6 w-32 mb-2" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12 mt-2" />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect to Questrade to automatically sync your holdings and
                transactions.
              </p>

              {showTokenInput ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="refreshToken">Refresh Token</Label>
                    <Input
                      id="refreshToken"
                      type="text"
                      placeholder="Paste your refresh token here"
                      value={refreshToken}
                      onChange={(e) => setRefreshToken(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Get this from Questrade App Hub → API → Generate Token
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleConnectWithToken} disabled={isConnecting}>
                      {isConnecting ? "Connecting..." : "Connect"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowTokenInput(false);
                        setRefreshToken("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={() => setShowTokenInput(true)}>
                    <Key className="h-4 w-4 mr-2" />
                    Connect with Token
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="pt-4 border-t">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isDeleting}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this account?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the account and all its holdings
                and transactions. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

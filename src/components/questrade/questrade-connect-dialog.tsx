"use client";

import { useState, useEffect } from "react";
import { Key, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { QuestradeAccount } from "@/types";

interface QuestradeConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Step = "connect" | "select" | "importing" | "success";

interface AccountSelection {
  account: QuestradeAccount;
  selected: boolean;
  customName: string;
}

export function QuestradeConnectDialog({
  open,
  onOpenChange,
  onSuccess,
}: QuestradeConnectDialogProps) {
  const [step, setStep] = useState<Step>("connect");
  const [refreshToken, setRefreshToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [bridgeAccountId, setBridgeAccountId] = useState<string | null>(null);
  const [accountSelections, setAccountSelections] = useState<AccountSelection[]>([]);
  const [importedAccounts, setImportedAccounts] = useState<string[]>([]);
  const [existingAccountNumbers, setExistingAccountNumbers] = useState<string[]>([]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep("connect");
      setRefreshToken("");
      setBridgeAccountId(null);
      setAccountSelections([]);
      setImportedAccounts([]);
    }
  }, [open]);

  // Fetch existing account numbers to filter already imported accounts
  useEffect(() => {
    if (open) {
      fetch("/api/accounts")
        .then((res) => res.json())
        .then((accounts) => {
          const numbers = accounts
            .filter((a: { questradeAccountNumber: string | null }) => a.questradeAccountNumber)
            .map((a: { questradeAccountNumber: string }) => a.questradeAccountNumber);
          setExistingAccountNumbers(numbers);
        })
        .catch(console.error);
    }
  }, [open]);

  const handleConnect = async () => {
    if (!refreshToken.trim()) {
      toast.error("Please enter a refresh token");
      return;
    }

    setIsConnecting(true);

    try {
      // Step 1: Create bridge account
      const createRes = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "__QUESTRADE_BRIDGE__",
          broker: "QUESTRADE",
        }),
      });

      if (!createRes.ok) {
        throw new Error("Failed to create bridge account");
      }

      const bridgeAccount = await createRes.json();
      setBridgeAccountId(bridgeAccount.id);

      // Step 2: Connect token to bridge account
      const connectRes = await fetch("/api/questrade/connect-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: bridgeAccount.id,
          refreshToken: refreshToken.trim(),
        }),
      });

      if (!connectRes.ok) {
        // Clean up bridge account on failure
        await fetch(`/api/accounts/${bridgeAccount.id}`, { method: "DELETE" });
        const error = await connectRes.json();
        throw new Error(error.error || "Failed to connect");
      }

      // Step 3: Fetch Questrade accounts
      const accountsRes = await fetch(`/api/questrade/accounts?accountId=${bridgeAccount.id}`);
      if (!accountsRes.ok) {
        throw new Error("Failed to fetch Questrade accounts");
      }

      const { accounts } = await accountsRes.json();

      // Initialize account selections with default names
      const selections: AccountSelection[] = accounts.map((account: QuestradeAccount) => ({
        account,
        selected: !existingAccountNumbers.includes(account.number),
        customName: `Questrade ${account.type}`,
      }));

      setAccountSelections(selections);
      setStep("select");
    } catch (err) {
      console.error("Failed to connect:", err);
      toast.error(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleToggleAccount = (number: string) => {
    setAccountSelections((prev) =>
      prev.map((s) =>
        s.account.number === number ? { ...s, selected: !s.selected } : s
      )
    );
  };

  const handleNameChange = (number: string, name: string) => {
    setAccountSelections((prev) =>
      prev.map((s) =>
        s.account.number === number ? { ...s, customName: name } : s
      )
    );
  };

  const handleImport = async () => {
    const selectedAccounts = accountSelections.filter((s) => s.selected);
    if (selectedAccounts.length === 0) {
      toast.error("Please select at least one account");
      return;
    }

    setStep("importing");

    try {
      const res = await fetch("/api/questrade/import-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceAccountId: bridgeAccountId,
          selectedAccounts: selectedAccounts.map((s) => ({
            number: s.account.number,
            type: s.account.type,
            customName: s.customName,
          })),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to import");
      }

      const result = await res.json();
      setImportedAccounts(result.created.map((a: { name: string }) => a.name));

      // Delete bridge account
      if (bridgeAccountId) {
        await fetch(`/api/accounts/${bridgeAccountId}`, { method: "DELETE" });
      }

      setStep("success");
    } catch (err) {
      console.error("Failed to import:", err);
      toast.error(err instanceof Error ? err.message : "Failed to import");
      setStep("select");
    }
  };

  const handleClose = () => {
    // Clean up bridge account if still exists and we're closing before completion
    if (bridgeAccountId && step !== "success") {
      fetch(`/api/accounts/${bridgeAccountId}`, { method: "DELETE" }).catch(console.error);
    }
    onOpenChange(false);
  };

  const handleDone = () => {
    onSuccess();
    onOpenChange(false);
  };

  const selectedCount = accountSelections.filter((s) => s.selected).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {step === "connect" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect Questrade</DialogTitle>
              <DialogDescription>
                Enter your Questrade refresh token to connect your accounts
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
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
                <Button onClick={handleConnect} disabled={isConnecting} className="flex-1">
                  {isConnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4 mr-2" />
                      Connect
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
              </div>
            </div>
          </>
        )}

        {step === "select" && (
          <>
            <DialogHeader>
              <DialogTitle>Select Accounts</DialogTitle>
              <DialogDescription>
                Choose which accounts to import and customize their names
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[400px] overflow-y-auto">
              {accountSelections.map((selection) => {
                const isExisting = existingAccountNumbers.includes(selection.account.number);
                return (
                  <div
                    key={selection.account.number}
                    className={`p-3 rounded-lg border ${isExisting ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selection.selected}
                        onCheckedChange={() => handleToggleAccount(selection.account.number)}
                        disabled={isExisting}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{selection.account.type}</span>
                          <span className="text-sm text-muted-foreground">
                            #{selection.account.number}
                          </span>
                          {selection.account.isPrimary && (
                            <Badge variant="secondary">Primary</Badge>
                          )}
                          {isExisting && (
                            <Badge variant="outline">Already imported</Badge>
                          )}
                        </div>
                        {!isExisting && (
                          <Input
                            placeholder="Account name"
                            value={selection.customName}
                            onChange={(e) =>
                              handleNameChange(selection.account.number, e.target.value)
                            }
                            disabled={!selection.selected}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleImport}
                disabled={selectedCount === 0}
                className="flex-1"
              >
                <Check className="h-4 w-4 mr-2" />
                Import {selectedCount} Account{selectedCount !== 1 ? "s" : ""}
              </Button>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {step === "importing" && (
          <>
            <DialogHeader>
              <DialogTitle>Importing Accounts</DialogTitle>
              <DialogDescription>
                Please wait while we import your accounts and sync data...
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </>
        )}

        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle>Import Complete!</DialogTitle>
              <DialogDescription>
                Your Questrade accounts have been imported successfully
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 rounded-lg bg-muted">
                <p className="font-medium mb-2">Imported accounts:</p>
                <ul className="list-disc list-inside space-y-1">
                  {importedAccounts.map((name, i) => (
                    <li key={i} className="text-sm">{name}</li>
                  ))}
                </ul>
              </div>
              <Button onClick={handleDone} className="w-full">
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

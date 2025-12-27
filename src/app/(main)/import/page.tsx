"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { BROKERS } from "@/types";
import type { ImportPreviewResponse, ImportPreview } from "@/types";

interface Account {
  id: string;
  name: string;
  broker: string;
  currency: string;
}

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedBroker, setSelectedBroker] = useState<string>("QUESTRADE");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);

  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch("/api/accounts");
        const data = await res.json();
        setAccounts(data);
        if (data.length > 0) {
          setSelectedAccountId(data[0].id);
          setSelectedBroker(data[0].broker);
        }
      } catch (err) {
        console.error("Failed to fetch accounts:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchAccounts();
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("broker", selectedBroker);
      formData.append("accountId", selectedAccountId);

      const res = await fetch("/api/import/preview", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to parse CSV");
      }

      const data: ImportPreviewResponse = await res.json();
      setPreview(data);
    } catch (err) {
      toast.error("Failed to parse CSV file");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCommit = async () => {
    if (!preview || !selectedAccountId) return;

    setIsCommitting(true);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          transactions: preview.preview.filter((p) => p.isValid),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to import");
      }

      const result = await res.json();
      toast.success(`Imported ${result.imported} transactions`);
      router.push("/transactions");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsCommitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <h1 className="text-2xl font-bold">Import</h1>
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
      <h1 className="text-2xl font-bold">Import CSV</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Account</label>
            <Select
              value={selectedAccountId}
              onValueChange={(v) => {
                setSelectedAccountId(v);
                const account = accounts.find((a) => a.id === v);
                if (account) setSelectedBroker(account.broker);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} ({account.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Broker Format</label>
            <Select value={selectedBroker} onValueChange={setSelectedBroker}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BROKERS.map((broker) => (
                  <SelectItem key={broker} value={broker}>
                    {broker.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full"
          >
            <Upload className="h-4 w-4 mr-2" />
            {isUploading ? "Processing..." : "Select CSV File"}
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="outline">
                {preview.totalRows} rows
              </Badge>
              <Badge variant="default" className="bg-green-600">
                <Check className="h-3 w-3 mr-1" />
                {preview.validRows} valid
              </Badge>
              {preview.errors.length > 0 && (
                <Badge variant="destructive">
                  <X className="h-3 w-3 mr-1" />
                  {preview.errors.length} errors
                </Badge>
              )}
            </div>

            {preview.errors.length > 0 && (
              <div className="p-3 bg-red-50 rounded-lg text-sm text-red-600">
                <p className="font-medium mb-1">Errors:</p>
                <ul className="list-disc list-inside space-y-1">
                  {preview.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {preview.errors.length > 5 && (
                    <li>... and {preview.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}

            <div className="max-h-64 overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Ticker</th>
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 font-mono">{row.ticker}</td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">
                          {row.type}
                        </Badge>
                      </td>
                      <td className="p-2 text-right font-mono">{row.quantity}</td>
                      <td className="p-2 text-right font-mono">${row.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              onClick={handleCommit}
              disabled={isCommitting || preview.validRows === 0}
              className="w-full"
            >
              {isCommitting
                ? "Importing..."
                : `Import ${preview.validRows} Transactions`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

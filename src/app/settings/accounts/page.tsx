"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Account {
  id: string;
  accountNumber: string;
  accountType: string;
  nickname: string | null;
  _count: {
    transactions: number;
  };
}

interface ImportFile {
  id: string;
  filename: string;
  rowCount: number;
  insertedCount: number;
  skippedCount: number;
  failedCount: number;
  importedAt: string;
}

interface ImportResult {
  success: boolean;
  summary: {
    total: number;
    inserted: number;
    skipped: number;
    failed: number;
  };
  errors?: { row: number; message: string }[];
}

export default function AccountsSettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [imports, setImports] = useState<ImportFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, importsRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/import"),
      ]);
      setAccounts(await accountsRes.json());
      setImports(await importsRes.json());
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      setImportResult(result);

      if (result.success) {
        fetchData();
      }
    } catch (error) {
      console.error("Import failed:", error);
      setImportResult({
        success: false,
        summary: { total: 0, inserted: 0, skipped: 0, failed: 0 },
        errors: [{ row: 0, message: "Import failed" }],
      });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  async function handleSaveNickname(accountId: string) {
    try {
      await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: accountId, nickname: editNickname }),
      });
      setEditingId(null);
      fetchData();
    } catch (error) {
      console.error("Failed to save nickname:", error);
    }
  }

  async function handleDeleteAccount(accountId: string) {
    if (!confirm("This will delete all transactions associated with this account. Continue?")) {
      return;
    }

    try {
      await fetch(`/api/accounts?id=${accountId}`, {
        method: "DELETE",
      });
      fetchData();
    } catch (error) {
      console.error("Failed to delete account:", error);
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">Accounts</h1>
      </div>

      {/* Import section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
            Import Transactions
          </h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              disabled={importing}
              className="max-w-sm text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100 disabled:opacity-50"
            />
            {importing && <span className="text-gray-500 text-sm">Importing...</span>}
          </div>

          {importResult && (
            <div
              className={`p-4 rounded-lg ${
                importResult.success ? "bg-green-50" : "bg-red-50"
              }`}
            >
              <div className="font-medium mb-2 text-sm">
                {importResult.success ? "Import completed" : "Import failed"}
              </div>
              <div className="text-sm space-y-1">
                <div>Total rows: {importResult.summary.total}</div>
                <div className="text-green-600">
                  Inserted: {importResult.summary.inserted}
                </div>
                <div className="text-yellow-600">
                  Skipped: {importResult.summary.skipped}
                </div>
                <div className="text-red-600">
                  Failed: {importResult.summary.failed}
                </div>
              </div>
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="mt-3 text-sm">
                  <div className="font-medium text-red-600">Error details:</div>
                  <ul className="list-disc list-inside">
                    {importResult.errors.slice(0, 5).map((err, idx) => (
                      <li key={idx}>
                        Row {err.row}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Account list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
            Account List
          </h3>
        </div>
        {loading ? (
          <div className="divide-y divide-gray-100">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-4 text-gray-500 text-sm">
            No accounts found. Please import an Excel file.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {accounts.map((acc) => (
              <div key={acc.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {acc.accountType}
                    </div>
                    <div className="text-xs text-gray-500">
                      {acc.accountNumber} · {acc._count.transactions} transactions
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteAccount(acc.id)}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    Delete
                  </button>
                </div>
                {editingId === acc.id ? (
                  <div className="flex gap-2 mt-2">
                    <input
                      value={editNickname}
                      onChange={(e) => setEditNickname(e.target.value)}
                      className="h-8 flex-1 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Enter nickname"
                    />
                    <button
                      onClick={() => handleSaveNickname(acc.id)}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div
                    className="mt-1 text-xs text-gray-400 cursor-pointer hover:text-gray-600"
                    onClick={() => {
                      setEditingId(acc.id);
                      setEditNickname(acc.nickname || "");
                    }}
                  >
                    {acc.nickname || "Tap to add nickname"}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import history */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
            Import History
          </h3>
        </div>
        {imports.length === 0 ? (
          <div className="p-4 text-gray-500 text-sm">No import history.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {imports.map((imp) => (
              <div key={imp.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {imp.filename}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(imp.importedAt)}
                  </div>
                </div>
                <div className="flex gap-4 mt-1 text-xs">
                  <span className="text-gray-500">{imp.rowCount} rows</span>
                  <span className="text-green-600">+{imp.insertedCount}</span>
                  <span className="text-yellow-600">~{imp.skippedCount}</span>
                  {imp.failedCount > 0 && (
                    <span className="text-red-600">-{imp.failedCount}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

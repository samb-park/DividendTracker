"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDate } from "@/lib/utils";
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

export default function AccountsPage() {
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
    <div className="space-y-6">
      {/* Import section */}
      <div className="bg-white rounded-lg">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-xs font-semibold tracking-wider text-[#5f6368] uppercase">Excel Import</h3>
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
      <div>
        <div className="border-b border-gray-200 mb-4">
          <span className="pb-2 text-xs font-semibold tracking-wider text-[#0a8043] border-b-[3px] border-[#0a8043] inline-block">
            ACCOUNTS
          </span>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-gray-500 text-sm">
            No accounts found. Please import an Excel file.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e8eaed]">
                  <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                    Account number
                  </th>
                  <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                    Type
                  </th>
                  <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                    Nickname
                  </th>
                  <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                    Transactions
                  </th>
                  <th className="py-2.5 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc, idx) => (
                  <tr
                    key={acc.id}
                    className={idx % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]"}
                  >
                    <td className="py-3 px-4 font-medium text-sm text-[#202124]">
                      {acc.accountNumber}
                    </td>
                    <td className="py-3 px-4 text-sm text-[#5f6368]">
                      {acc.accountType}
                    </td>
                    <td className="py-3 px-4">
                      {editingId === acc.id ? (
                        <div className="flex gap-2">
                          <input
                            value={editNickname}
                            onChange={(e) => setEditNickname(e.target.value)}
                            className="h-8 w-32 px-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            placeholder="Nickname"
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
                        <span
                          className="cursor-pointer hover:underline text-sm text-[#5f6368]"
                          onClick={() => {
                            setEditingId(acc.id);
                            setEditNickname(acc.nickname || "");
                          }}
                        >
                          {acc.nickname || "(Click to set)"}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-[#202124]">{acc._count.transactions}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleDeleteAccount(acc.id)}
                        className="px-3 py-1 text-sm text-red-500 hover:text-red-700 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Import history */}
      <div>
        <div className="border-b border-gray-200 mb-4">
          <span className="pb-2 text-xs font-semibold tracking-wider text-[#5f6368] inline-block">
            IMPORT HISTORY
          </span>
        </div>
        {imports.length === 0 ? (
          <div className="text-gray-500 text-sm">No import history.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e8eaed]">
                  <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                    Filename
                  </th>
                  <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                    Import date
                  </th>
                  <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                    Total rows
                  </th>
                  <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                    Inserted
                  </th>
                  <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                    Skipped
                  </th>
                  <th className="text-right py-2.5 px-4 text-xs font-normal text-[#5f6368]">
                    Failed
                  </th>
                </tr>
              </thead>
              <tbody>
                {imports.map((imp, idx) => (
                  <tr
                    key={imp.id}
                    className={idx % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]"}
                  >
                    <td className="py-3 px-4 text-sm text-[#202124]">{imp.filename}</td>
                    <td className="py-3 px-4 text-sm text-[#202124]">{formatDate(imp.importedAt)}</td>
                    <td className="py-3 px-4 text-right text-sm text-[#202124]">{imp.rowCount}</td>
                    <td className="py-3 px-4 text-right text-sm text-green-600">
                      {imp.insertedCount}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-yellow-600">
                      {imp.skippedCount}
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-red-600">
                      {imp.failedCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
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

export default function AccountsSettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const accountsRes = await fetch("/api/accounts");
      setAccounts(await accountsRes.json());
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      await fetch(`/api/accounts?id=${accountId}`, { method: "DELETE" });
      fetchData();
    } catch (error) {
      console.error("Failed to delete account:", error);
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">Accounts</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Account List</h3>
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
          <div className="p-4 text-gray-500 text-sm">No accounts found. Add transactions manually to create account history.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {accounts.map((acc) => (
              <div key={acc.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{acc.accountType}</div>
                    <div className="text-xs text-gray-500">{acc.accountNumber} · {acc._count.transactions} transactions</div>
                  </div>
                  <button onClick={() => handleDeleteAccount(acc.id)} className="text-xs text-red-500 hover:text-red-700 transition-colors">Delete</button>
                </div>
                {editingId === acc.id ? (
                  <div className="flex gap-2 mt-2">
                    <input value={editNickname} onChange={(e) => setEditNickname(e.target.value)} className="h-8 flex-1 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="Enter nickname" />
                    <button onClick={() => handleSaveNickname(acc.id)} className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">Save</button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-gray-400 cursor-pointer hover:text-gray-600" onClick={() => { setEditingId(acc.id); setEditNickname(acc.nickname || ""); }}>
                    {acc.nickname || "Tap to add nickname"}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

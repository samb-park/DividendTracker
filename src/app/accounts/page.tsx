"use client";

import { useEffect, useState, useCallback } from "react";
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

export default function AccountsPage() {
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
    <div className="space-y-6">
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
          <div className="text-gray-500 text-sm">No accounts found. Add transactions manually to get started.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e8eaed]">
                  <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">Account number</th>
                  <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">Type</th>
                  <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">Nickname</th>
                  <th className="text-left py-2.5 px-4 text-xs font-normal text-[#5f6368]">Transactions</th>
                  <th className="py-2.5 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc, idx) => (
                  <tr key={acc.id} className={idx % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]"}>
                    <td className="py-3 px-4 font-medium text-sm text-[#202124]">{acc.accountNumber}</td>
                    <td className="py-3 px-4 text-sm text-[#5f6368]">{acc.accountType}</td>
                    <td className="py-3 px-4">
                      {editingId === acc.id ? (
                        <div className="flex gap-2">
                          <input value={editNickname} onChange={(e) => setEditNickname(e.target.value)} className="h-8 w-32 px-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" placeholder="Nickname" />
                          <button onClick={() => handleSaveNickname(acc.id)} className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">Save</button>
                          <button onClick={() => setEditingId(null)} className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
                        </div>
                      ) : (
                        <span className="cursor-pointer hover:underline text-sm text-[#5f6368]" onClick={() => { setEditingId(acc.id); setEditNickname(acc.nickname || ""); }}>
                          {acc.nickname || "(Click to set)"}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-[#202124]">{acc._count.transactions}</td>
                    <td className="py-3 px-4">
                      <button onClick={() => handleDeleteAccount(acc.id)} className="px-3 py-1 text-sm text-red-500 hover:text-red-700 transition-colors">Delete</button>
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

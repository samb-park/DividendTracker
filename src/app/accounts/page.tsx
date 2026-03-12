"use client";

import { useEffect, useState, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface Account {
  id: string;
  name: string | null;
  accountNumber: string | null;
  accountType: string;
  baseCurrency: "CAD" | "USD";
  currentContributionRoom: number | null;
  isActive: boolean;
  _count: {
    transactions: number;
  };
}

const ACCOUNT_TYPES = ["TFSA", "RRSP", "FHSA", "Margin", "Cash", "Other"];
const CURRENCIES = ["CAD", "USD"] as const;

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    accountType: "TFSA",
    accountNumber: "",
    baseCurrency: "CAD",
    currentContributionRoom: "",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    accountType: "",
    accountNumber: "",
    baseCurrency: "CAD",
    currentContributionRoom: "",
    isActive: true,
  });

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

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      setCreateForm({ name: "", accountType: "TFSA", accountNumber: "", baseCurrency: "CAD", currentContributionRoom: "" });
      fetchData();
    } catch (error) {
      console.error("Failed to create account:", error);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(acc: Account) {
    setEditingId(acc.id);
    setEditForm({
      name: acc.name || "",
      accountType: acc.accountType,
      accountNumber: acc.accountNumber || "",
      baseCurrency: acc.baseCurrency,
      currentContributionRoom: acc.currentContributionRoom === null ? "" : String(acc.currentContributionRoom),
      isActive: acc.isActive,
    });
  }

  async function handleSaveAccount(accountId: string) {
    setSaving(true);
    try {
      await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: accountId, ...editForm }),
      });
      setEditingId(null);
      fetchData();
    } catch (error) {
      console.error("Failed to save account:", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount(accountId: string) {
    if (!confirm("This will delete the account and related transactions. Continue?")) return;
    try {
      await fetch(`/api/accounts?id=${accountId}`, { method: "DELETE" });
      fetchData();
    } catch (error) {
      console.error("Failed to delete account:", error);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-slate-800">
        <div className="border-b border-gray-200 dark:border-slate-800 mb-4">
          <span className="pb-2 text-xs font-semibold tracking-wider text-[#0a8043] border-b-[3px] border-[#0a8043] inline-block">ADD ACCOUNT</span>
        </div>
        <form onSubmit={handleCreateAccount} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} placeholder="Account name (optional)" className="h-10 px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-white" />
          <select value={createForm.accountType} onChange={(e) => setCreateForm((p) => ({ ...p, accountType: e.target.value }))} className="h-10 px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-white">
            {ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <input value={createForm.accountNumber} onChange={(e) => setCreateForm((p) => ({ ...p, accountNumber: e.target.value }))} placeholder="Account number (optional)" className="h-10 px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-white" />
          <select value={createForm.baseCurrency} onChange={(e) => setCreateForm((p) => ({ ...p, baseCurrency: e.target.value }))} className="h-10 px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-white">
            {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </select>
          <input value={createForm.currentContributionRoom} onChange={(e) => setCreateForm((p) => ({ ...p, currentContributionRoom: e.target.value }))} placeholder="Current contribution room (optional)" type="number" step="any" className="h-10 px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-sm md:col-span-2 bg-white dark:bg-slate-950 text-gray-900 dark:text-white" />
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">{saving ? "Saving..." : "Add account"}</button>
          </div>
        </form>
      </div>

      <div>
        <div className="border-b border-gray-200 dark:border-slate-800 mb-4">
          <span className="pb-2 text-xs font-semibold tracking-wider text-[#0a8043] border-b-[3px] border-[#0a8043] inline-block">ACCOUNTS</span>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-gray-500 dark:text-slate-400 text-sm">No accounts found. Create your first account above.</div>
        ) : (
          <div className="space-y-3">
            {accounts.map((acc) => (
              <div key={acc.id} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 p-4">
                {editingId === acc.id ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} placeholder="Account name" className="h-10 px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-white" />
                    <select value={editForm.accountType} onChange={(e) => setEditForm((p) => ({ ...p, accountType: e.target.value }))} className="h-10 px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-white">
                      {ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <input value={editForm.accountNumber} onChange={(e) => setEditForm((p) => ({ ...p, accountNumber: e.target.value }))} placeholder="Account number" className="h-10 px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-white" />
                    <select value={editForm.baseCurrency} onChange={(e) => setEditForm((p) => ({ ...p, baseCurrency: e.target.value }))} className="h-10 px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-white">
                      {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                    </select>
                    <input value={editForm.currentContributionRoom} onChange={(e) => setEditForm((p) => ({ ...p, currentContributionRoom: e.target.value }))} placeholder="Contribution room" type="number" step="any" className="h-10 px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-white" />
                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
                      <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm((p) => ({ ...p, isActive: e.target.checked }))} />
                      Active
                    </label>
                    <div className="md:col-span-2 flex gap-2 justify-end">
                      <button onClick={() => setEditingId(null)} className="px-3 py-2 text-sm text-gray-600 dark:text-slate-300 hover:text-gray-800 dark:hover:text-white">Cancel</button>
                      <button onClick={() => handleSaveAccount(acc.id)} disabled={saving} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{acc.name || acc.accountType}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{acc.accountType}{acc.accountNumber ? ` · ${acc.accountNumber}` : ""}{` · ${acc.baseCurrency}`}{acc.isActive ? " · Active" : " · Inactive"}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Transactions: {acc._count.transactions}{acc.currentContributionRoom !== null ? ` · Room left: ${acc.currentContributionRoom}` : ""}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(acc)} className="px-3 py-1.5 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg">Edit</button>
                      <button onClick={() => handleDeleteAccount(acc.id)} className="px-3 py-1.5 text-sm text-red-500 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg">Delete</button>
                    </div>
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

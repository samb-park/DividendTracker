"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface Account {
  id: string;
  name: string | null;
  accountNumber: string | null;
  accountType: string;
  baseCurrency: "CAD" | "USD";
}

interface Transaction {
  id: string;
  transactionDate: string;
  settlementDate: string;
  action: string;
  symbol: string | null;
  normalizedSymbol: string | null;
  description: string;
  quantity: number | null;
  price: number | null;
  grossAmount?: number | null;
  commission?: number | null;
  netAmount: number | null;
  currency: string;
  activityType: string | null;
  cadEquivalent?: number | null;
  notes?: string | null;
  account: {
    id: string;
    name: string | null;
    accountNumber: string | null;
    accountType: string;
    baseCurrency: "CAD" | "USD";
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const ACTION_OPTIONS = ["BUY","SELL","DIVIDEND","REINVEST","DEPOSIT","WITHDRAWAL","FEE","INTEREST","TRANSFER_IN","TRANSFER_OUT"];
const CURRENCY_OPTIONS = ["CAD", "USD"];

const emptyForm = (today: string) => ({
  accountId: "",
  transactionDate: today,
  settlementDate: today,
  action: "BUY",
  symbol: "",
  description: "",
  quantity: "",
  price: "",
  grossAmount: "",
  commission: "",
  netAmount: "",
  currency: "CAD",
  activityType: "",
  cadEquivalent: "",
  notes: "",
});

export default function TransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [symbolFilter, setSymbolFilter] = useState<string>("");

  const [actions, setActions] = useState<string[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [form, setForm] = useState(emptyForm(today));

  useEffect(() => {
    fetchAccounts();
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [pagination.page, accountFilter, yearFilter, actionFilter, symbolFilter]);

  const currentActionNeedsUnits = ["BUY", "SELL", "REINVEST"].includes(form.action);
  const currentActionNeedsCashOnly = ["DIVIDEND", "DEPOSIT", "WITHDRAWAL", "FEE", "INTEREST", "TRANSFER_IN", "TRANSFER_OUT"].includes(form.action);

  async function fetchAccounts() {
    const res = await fetch("/api/accounts");
    const data = await res.json();
    setAccounts(data);
    setForm((prev) => ({ ...prev, accountId: prev.accountId || data[0]?.id || "", currency: prev.currency || data[0]?.baseCurrency || "CAD" }));
  }

  async function fetchFilterOptions() {
    const [actionsRes, symbolsRes, yearsRes] = await Promise.all([
      fetch("/api/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "actions" }) }),
      fetch("/api/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "symbols" }) }),
      fetch("/api/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "years" }) }),
    ]);
    setActions(await actionsRes.json());
    setSymbols(await symbolsRes.json());
    setYears(await yearsRes.json());
  }

  async function fetchTransactions() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pagination.page));
      params.set("limit", String(pagination.limit));
      if (accountFilter !== "all") params.set("accountId", accountFilter);
      if (yearFilter !== "all") params.set("year", yearFilter);
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (symbolFilter) params.set("symbol", symbolFilter);
      const res = await fetch(`/api/transactions?${params.toString()}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setAccountFilter("all");
    setYearFilter("all");
    setActionFilter("all");
    setSymbolFilter("");
    setPagination((prev) => ({ ...prev, page: 1 }));
  }

  function getActionStyle(action: string): string {
    switch (action) {
      case "BUY": return "bg-blue-50 text-blue-700 border-blue-100";
      case "SELL":
      case "WITHDRAWAL":
      case "FEE": return "bg-red-50 text-red-700 border-red-100";
      case "DIVIDEND":
      case "INTEREST": return "bg-green-50 text-green-700 border-green-100";
      default: return "bg-gray-50 text-gray-700 border-gray-100";
    }
  }

  function updateForm(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function beginEdit(tx: Transaction) {
    setEditingId(tx.id);
    setShowForm(true);
    setForm({
      accountId: tx.account.id,
      transactionDate: tx.transactionDate.slice(0, 10),
      settlementDate: tx.settlementDate.slice(0, 10),
      action: tx.action,
      symbol: tx.normalizedSymbol || tx.symbol || "",
      description: tx.description,
      quantity: tx.quantity == null ? "" : String(tx.quantity),
      price: tx.price == null ? "" : String(tx.price),
      grossAmount: tx.grossAmount == null ? "" : String(tx.grossAmount),
      commission: tx.commission == null ? "" : String(tx.commission),
      netAmount: tx.netAmount == null ? "" : String(tx.netAmount),
      currency: tx.currency,
      activityType: tx.activityType || "",
      cadEquivalent: tx.cadEquivalent == null ? "" : String(tx.cadEquivalent),
      notes: tx.notes || "",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm((prev) => ({ ...emptyForm(today), accountId: prev.accountId || accounts[0]?.id || "", currency: prev.currency || accounts[0]?.baseCurrency || "CAD" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        accountId: form.accountId,
        transactionDate: form.transactionDate,
        settlementDate: form.settlementDate,
        action: form.action,
        symbol: form.symbol,
        description: form.description,
        quantity: form.quantity ? Number(form.quantity) : null,
        price: form.price ? Number(form.price) : null,
        grossAmount: form.grossAmount ? Number(form.grossAmount) : null,
        commission: form.commission ? Number(form.commission) : null,
        netAmount: form.netAmount ? Number(form.netAmount) : null,
        currency: form.currency,
        activityType: form.activityType,
        cadEquivalent: form.cadEquivalent ? Number(form.cadEquivalent) : null,
        notes: form.notes,
      };

      const res = await fetch("/api/transactions", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : { type: "create", ...payload }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save transaction");
      }
      resetForm();
      await Promise.all([fetchTransactions(), fetchFilterOptions()]);
      setShowForm(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save transaction");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 거래를 삭제할까요?")) return;
    const res = await fetch(`/api/transactions?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      if (editingId === id) resetForm();
      await Promise.all([fetchTransactions(), fetchFilterOptions()]);
    }
  }

  const hasActiveFilters = accountFilter !== "all" || yearFilter !== "all" || actionFilter !== "all" || symbolFilter !== "";

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 md:p-5 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-[#0a8043] uppercase">Transactions</div>
            <h1 className="text-xl md:text-2xl font-semibold text-gray-900 mt-1">Manual ledger</h1>
            <p className="text-sm text-gray-500 mt-1">추가, 수정, 삭제까지 한 화면에서 할 수 있게 정리했어요.</p>
          </div>
          <button onClick={() => setShowForm((v) => !v)} className="shrink-0 px-4 py-2 text-sm bg-[#0a8043] text-white rounded-xl hover:bg-[#086b39] transition-colors">
            {showForm ? "폼 접기" : editingId ? "수정 계속" : "거래 추가"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="p-4 md:p-5 space-y-4 bg-gradient-to-b from-[#f7fbf8] to-white">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Select value={form.accountId} onValueChange={(value) => updateForm("accountId", value)}>
                <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
                <SelectContent>{accounts.map((acc) => <SelectItem key={acc.id} value={acc.id}>{acc.name || acc.accountType}{acc.accountNumber ? ` · ${acc.accountNumber}` : ""}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={form.action} onValueChange={(value) => updateForm("action", value)}>
                <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
                <SelectContent>{ACTION_OPTIONS.map((action) => <SelectItem key={action} value={action}>{action}</SelectItem>)}</SelectContent>
              </Select>
              <input type="date" value={form.transactionDate} onChange={(e) => updateForm("transactionDate", e.target.value)} className="h-11 px-3 border border-gray-200 rounded-xl text-sm" required />
              <input type="date" value={form.settlementDate} onChange={(e) => updateForm("settlementDate", e.target.value)} className="h-11 px-3 border border-gray-200 rounded-xl text-sm" required />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input type="text" value={form.symbol} onChange={(e) => updateForm("symbol", e.target.value.toUpperCase())} placeholder="Symbol (optional)" className="h-11 px-3 border border-gray-200 rounded-xl text-sm" />
              <Select value={form.currency} onValueChange={(value) => updateForm("currency", value)}>
                <SelectTrigger><SelectValue placeholder="Currency" /></SelectTrigger>
                <SelectContent>{CURRENCY_OPTIONS.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent>
              </Select>
              <input type="text" value={form.description} onChange={(e) => updateForm("description", e.target.value)} placeholder="Description" className="h-11 px-3 border border-gray-200 rounded-xl text-sm md:col-span-2" required />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <input type="number" step="any" value={form.quantity} onChange={(e) => updateForm("quantity", e.target.value)} placeholder={currentActionNeedsUnits ? "Quantity" : "Quantity (opt)"} className="h-11 px-3 border border-gray-200 rounded-xl text-sm" />
              <input type="number" step="any" value={form.price} onChange={(e) => updateForm("price", e.target.value)} placeholder={currentActionNeedsUnits ? "Price" : "Price (opt)"} className="h-11 px-3 border border-gray-200 rounded-xl text-sm" />
              <input type="number" step="any" value={form.grossAmount} onChange={(e) => updateForm("grossAmount", e.target.value)} placeholder={currentActionNeedsCashOnly ? "Gross amount" : "Gross amount"} className="h-11 px-3 border border-gray-200 rounded-xl text-sm" />
              <input type="number" step="any" value={form.commission} onChange={(e) => updateForm("commission", e.target.value)} placeholder="Commission" className="h-11 px-3 border border-gray-200 rounded-xl text-sm" />
              <input type="number" step="any" value={form.netAmount} onChange={(e) => updateForm("netAmount", e.target.value)} placeholder="Net amount" className="h-11 px-3 border border-gray-200 rounded-xl text-sm" />
              <input type="number" step="any" value={form.cadEquivalent} onChange={(e) => updateForm("cadEquivalent", e.target.value)} placeholder="CAD equivalent" className="h-11 px-3 border border-gray-200 rounded-xl text-sm" />
              <input type="text" value={form.activityType} onChange={(e) => updateForm("activityType", e.target.value)} placeholder="Activity type (optional)" className="h-11 px-3 border border-gray-200 rounded-xl text-sm md:col-span-2" />
            </div>
            <textarea value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} placeholder="Notes (optional)" className="min-h-[92px] w-full px-3 py-3 border border-gray-200 rounded-xl text-sm resize-y" />
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-1">
              <div className="text-sm text-red-500 min-h-[20px]">{error || ""}</div>
              <div className="flex gap-2">
                {editingId && <button type="button" onClick={resetForm} className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white hover:bg-gray-50">Cancel edit</button>}
                <button type="submit" disabled={saving} className="px-4 py-2.5 text-sm bg-[#0a8043] text-white rounded-xl hover:bg-[#086b39] disabled:opacity-50">{saving ? "Saving..." : editingId ? "Save changes" : "Add transaction"}</button>
              </div>
            </div>
          </form>
        )}
      </section>

      <section className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-[#0a8043] uppercase">Filters</div>
            <div className="text-sm text-gray-500 mt-1">계좌, 연도, 액션, 심볼별로 빠르게 좁혀볼 수 있어요.</div>
          </div>
          {hasActiveFilters && <button onClick={clearFilters} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors">Clear all</button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Select value={accountFilter} onValueChange={setAccountFilter}><SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger><SelectContent><SelectItem value="all">All accounts</SelectItem>{accounts.map((acc) => <SelectItem key={acc.id} value={acc.id}>{acc.name || acc.accountType}</SelectItem>)}</SelectContent></Select>
          <Select value={yearFilter} onValueChange={setYearFilter}><SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger><SelectContent><SelectItem value="all">All years</SelectItem>{years.map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent></Select>
          <Select value={actionFilter} onValueChange={setActionFilter}><SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger><SelectContent><SelectItem value="all">All actions</SelectItem>{actions.map((action) => <SelectItem key={action} value={action}>{action}</SelectItem>)}</SelectContent></Select>
          <Select value={symbolFilter || "all"} onValueChange={(value) => setSymbolFilter(value === "all" ? "" : value)}><SelectTrigger><SelectValue placeholder="Symbol" /></SelectTrigger><SelectContent><SelectItem value="all">All symbols</SelectItem>{symbols.map((symbol) => <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>)}</SelectContent></Select>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div><div className="text-xs font-semibold tracking-[0.18em] text-[#0a8043] uppercase">History</div><h2 className="text-lg font-semibold text-gray-900 mt-1">Recent transactions</h2></div>
          <div className="text-sm text-gray-500">{pagination.total} total</div>
        </div>
        {loading ? (
          <div className="space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4"><Skeleton className="h-4 w-28 mb-3" /><Skeleton className="h-4 w-full mb-2" /><Skeleton className="h-4 w-2/3" /></div>)}</div>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-500">아직 거래가 없어요. 위에서 첫 거래를 추가해보세요.</div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {transactions.map((tx) => (
                <div key={tx.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-gray-900">{tx.normalizedSymbol || tx.symbol || tx.description}</div><div className="text-xs text-gray-500 mt-1">{tx.account.name || tx.account.accountType} · {formatDate(tx.settlementDate)}</div></div><span className={`px-2.5 py-1 text-[11px] font-medium rounded-full border ${getActionStyle(tx.action)}`}>{tx.action}</span></div>
                  <div className="grid grid-cols-2 gap-3 mt-4 text-sm"><div><div className="text-xs text-gray-400">Amount</div><div className={`font-semibold ${(tx.netAmount || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>{tx.netAmount !== null ? formatCurrency(tx.netAmount) : "-"}</div></div><div><div className="text-xs text-gray-400">Qty / Price</div><div className="font-medium text-gray-800">{tx.quantity !== null ? formatNumber(tx.quantity) : "-"}{tx.price !== null ? ` · ${formatCurrency(tx.price)}` : ""}</div></div></div>
                  <div className="mt-3 text-sm text-gray-600">{tx.description}</div>
                  <div className="mt-4 flex gap-2"><button onClick={() => beginEdit(tx)} className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white hover:bg-gray-50">Edit</button><button onClick={() => handleDelete(tx.id)} className="px-3 py-2 text-sm text-red-600 border border-red-100 rounded-xl bg-red-50 hover:bg-red-100">Delete</button></div>
                </div>
              ))}
            </div>
            <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm"><div className="overflow-x-auto"><table className="w-full"><thead className="bg-gray-50/80 border-b border-gray-100"><tr><th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Date</th><th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Account</th><th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Action</th><th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Symbol</th><th className="text-right py-3 px-4 text-xs font-medium text-gray-500">Qty</th><th className="text-right py-3 px-4 text-xs font-medium text-gray-500">Price</th><th className="text-right py-3 px-4 text-xs font-medium text-gray-500">Amount</th><th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Description</th><th className="text-right py-3 px-4 text-xs font-medium text-gray-500">Actions</th></tr></thead><tbody>{transactions.map((tx) => <tr key={tx.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60"><td className="py-3 px-4 text-sm text-gray-900 whitespace-nowrap">{formatDate(tx.settlementDate)}</td><td className="py-3 px-4 text-sm text-gray-600">{tx.account.name || tx.account.accountType}</td><td className="py-3 px-4"><span className={`px-2.5 py-1 text-[11px] font-medium rounded-full border ${getActionStyle(tx.action)}`}>{tx.action}</span></td><td className="py-3 px-4 text-sm font-medium text-gray-900">{tx.normalizedSymbol || tx.symbol || "-"}</td><td className="py-3 px-4 text-sm text-right text-gray-900">{tx.quantity !== null ? formatNumber(tx.quantity) : "-"}</td><td className="py-3 px-4 text-sm text-right text-gray-900">{tx.price !== null ? formatCurrency(tx.price) : "-"}</td><td className={`py-3 px-4 text-sm text-right font-semibold ${(tx.netAmount || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>{tx.netAmount !== null ? formatCurrency(tx.netAmount) : "-"}</td><td className="py-3 px-4 text-sm text-gray-600 max-w-[280px] truncate">{tx.description}</td><td className="py-3 px-4"><div className="flex justify-end gap-2"><button onClick={() => beginEdit(tx)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50">Edit</button><button onClick={() => handleDelete(tx.id)} className="px-3 py-1.5 text-sm text-red-600 border border-red-100 rounded-lg bg-red-50 hover:bg-red-100">Delete</button></div></td></tr>)}</tbody></table></div></div>
            <div className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-gray-100 p-4"><div className="text-sm text-gray-500">{pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</div><div className="flex gap-2"><button disabled={pagination.page <= 1} onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))} className="px-4 py-2 text-sm border border-gray-200 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button><button disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))} className="px-4 py-2 text-sm border border-gray-200 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button></div></div>
          </>
        )}
      </section>
    </div>
  );
}

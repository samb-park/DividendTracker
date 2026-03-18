"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { fmt } from "@/lib/utils";

interface CashItem {
  id: string;
  date: string;
  portfolioId: string;
  portfolioName: string;
  action: "DEPOSIT" | "WITHDRAWAL";
  amount: number;
  currency: "CAD" | "USD";
  notes: string | null;
}

interface Portfolio {
  id: string;
  name: string;
}

const CURRENT_YEAR = new Date().getFullYear();

export function CashFlow({ fxRate }: { fxRate: number }) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [items, setItems] = useState<CashItem[]>([]);
  const [years, setYears] = useState<number[]>([CURRENT_YEAR]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    portfolioId: "",
    action: "DEPOSIT" as "DEPOSIT" | "WITHDRAWAL",
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    currency: "CAD" as "CAD" | "USD",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchData = (y: number) => {
    setLoading(true);
    fetch(`/api/cash-transactions?year=${y}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        if (d.years?.length) setYears(d.years);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchData(year); }, [year]);

  useEffect(() => {
    fetch("/api/portfolios")
      .then((r) => r.json())
      .then((d: Portfolio[]) => {
        setPortfolios(d);
        if (d.length > 0) setForm((f) => ({ ...f, portfolioId: d[0].id }));
      })
      .catch(() => {});
  }, []);

  const toCAD = (amount: number, currency: "CAD" | "USD") =>
    currency === "USD" ? amount * fxRate : amount;

  const byAccount = useMemo(() => {
    const map = new Map<string, { name: string; items: CashItem[] }>();
    for (const item of items) {
      if (!map.has(item.portfolioId)) {
        map.set(item.portfolioId, { name: item.portfolioName, items: [] });
      }
      map.get(item.portfolioId)!.items.push(item);
    }
    return Array.from(map.entries())
      .map(([id, data]) => {
        const netCAD = data.items.reduce((s, i) => {
          const v = toCAD(i.amount, i.currency);
          return s + (i.action === "DEPOSIT" ? v : -v);
        }, 0);
        return { id, name: data.name, items: data.items, netCAD };
      })
      .sort((a, b) => b.netCAD - a.netCAD);
  }, [items, fxRate]);

  const totalDepositCAD = items
    .filter((i) => i.action === "DEPOSIT")
    .reduce((s, i) => s + toCAD(i.amount, i.currency), 0);
  const totalWithdrawalCAD = items
    .filter((i) => i.action === "WITHDRAWAL")
    .reduce((s, i) => s + toCAD(i.amount, i.currency), 0);
  const netCAD = totalDepositCAD - totalWithdrawalCAD;

  const toggleAccount = (id: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!form.portfolioId || !form.amount || !form.date) return;
    setSaving(true);
    await fetch("/api/cash-transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
    });
    setSaving(false);
    setShowForm(false);
    setForm((f) => ({ ...f, amount: "", notes: "" }));
    fetchData(year);
  };

  return (
    <div>
      {/* Year nav + add button */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1">
          <button className="btn-retro p-0.5" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft size={11} />
          </button>
          <span className="text-accent text-xs tabular-nums w-10 text-center">{year}</span>
          <button
            className="btn-retro p-0.5 disabled:opacity-30"
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= CURRENT_YEAR}
          >
            <ChevronRight size={11} />
          </button>
        </div>
        <button
          className="btn-retro btn-retro-primary text-xs flex items-center gap-1"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus size={11} />
          ADD
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="border border-border bg-card p-3 mb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-muted-foreground tracking-widest mb-1">ACCOUNT</div>
              <select
                className="w-full bg-background border border-border text-xs px-2 py-1.5"
                value={form.portfolioId}
                onChange={(e) => setForm((f) => ({ ...f, portfolioId: e.target.value }))}
              >
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground tracking-widest mb-1">TYPE</div>
              <select
                className="w-full bg-background border border-border text-xs px-2 py-1.5"
                value={form.action}
                onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as "DEPOSIT" | "WITHDRAWAL" }))}
              >
                <option value="DEPOSIT">DEPOSIT</option>
                <option value="WITHDRAWAL">WITHDRAWAL</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-muted-foreground tracking-widest mb-1">DATE</div>
              <input
                type="date"
                className="w-full bg-background border border-border text-xs px-2 py-1.5"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground tracking-widest mb-1">CURRENCY</div>
              <select
                className="w-full bg-background border border-border text-xs px-2 py-1.5"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as "CAD" | "USD" }))}
              >
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground tracking-widest mb-1">AMOUNT</div>
            <input
              type="number"
              step="0.01"
              className="w-full bg-background border border-border text-xs px-2 py-1.5"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground tracking-widest mb-1">NOTES (OPTIONAL)</div>
            <input
              type="text"
              className="w-full bg-background border border-border text-xs px-2 py-1.5"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              className="btn-retro btn-retro-primary text-xs px-3 py-1 flex-1 disabled:opacity-50"
              onClick={handleAdd}
              disabled={saving || !form.amount}
            >
              {saving ? "SAVING..." : "SAVE"}
            </button>
            <button className="btn-retro text-xs px-3 py-1" onClick={() => setShowForm(false)}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-xs text-center py-12">LOADING...</div>
      ) : items.length === 0 ? (
        <div className="text-muted-foreground text-xs text-center py-12 border border-dashed border-border">
          NO CASH TRANSACTIONS FOR {year}
        </div>
      ) : (
        <>
          {/* Year summary */}
          <div className="grid grid-cols-3 gap-px bg-border border border-border mb-4">
            <div className="bg-card p-2">
              <div className="text-[10px] text-muted-foreground tracking-widest mb-1">DEPOSITED</div>
              <div className="text-sm font-medium tabular-nums text-positive">C${fmt(totalDepositCAD)}</div>
            </div>
            <div className="bg-card p-2">
              <div className="text-[10px] text-muted-foreground tracking-widest mb-1">WITHDRAWN</div>
              <div className="text-sm font-medium tabular-nums text-negative">C${fmt(totalWithdrawalCAD)}</div>
            </div>
            <div className="bg-card p-2">
              <div className="text-[10px] text-muted-foreground tracking-widest mb-1">NET</div>
              <div className={`text-sm font-medium tabular-nums ${netCAD >= 0 ? "text-positive" : "text-negative"}`}>
                {netCAD >= 0 ? "+" : ""}C${fmt(Math.abs(netCAD))}
              </div>
            </div>
          </div>

          {/* Per-account */}
          <div className="space-y-2">
            {byAccount.map((acct) => {
              const isExpanded = expandedAccounts.has(acct.id);
              return (
                <div key={acct.id} className="border border-border bg-card">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                    onClick={() => toggleAccount(acct.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-accent">{acct.name}</span>
                      <span className="text-[10px] text-muted-foreground">{acct.items.length} entries</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs tabular-nums ${acct.netCAD >= 0 ? "text-positive" : "text-negative"}`}>
                        {acct.netCAD >= 0 ? "+" : ""}C${fmt(Math.abs(acct.netCAD))}
                      </span>
                      {isExpanded
                        ? <ChevronUp size={12} className="text-muted-foreground" />
                        : <ChevronDown size={12} className="text-muted-foreground" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border divide-y divide-border/50">
                      {acct.items.map((item) => {
                        const sym = item.currency === "CAD" ? "C$" : "$";
                        const isDeposit = item.action === "DEPOSIT";
                        return (
                          <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                            <span className="text-[11px] text-muted-foreground tabular-nums w-20 flex-shrink-0">{item.date}</span>
                            <span className={`text-[10px] tracking-wider w-16 flex-shrink-0 ${isDeposit ? "text-positive" : "text-negative"}`}>
                              {item.action}
                            </span>
                            <span className="text-[11px] flex-1 text-muted-foreground truncate">{item.notes ?? ""}</span>
                            <span className={`text-[11px] tabular-nums flex-shrink-0 ${isDeposit ? "text-positive" : "text-negative"}`}>
                              {isDeposit ? "+" : "-"}{sym}{fmt(item.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

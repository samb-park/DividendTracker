"use client";

import Link from "next/link";
import { ArrowLeft, Target } from "lucide-react";
import { useEffect, useState } from "react";

interface PortfolioTarget {
  id: string;
  symbol: string;
  targetWeight: number;
  currency: "CAD" | "USD";
}

interface PortfolioSettings {
  weeklyContributionAmount: number;
  targetAnnualDividend: number | null;
  targetMonthlyDividend: number | null;
}

export default function TargetsSettingsPage() {
  const [targets, setTargets] = useState<PortfolioTarget[]>([]);
  const [settings, setSettings] = useState<PortfolioSettings>({
    weeklyContributionAmount: 0,
    targetAnnualDividend: null,
    targetMonthlyDividend: null,
  });
  const [targetForm, setTargetForm] = useState({ symbol: "", targetWeight: "", currency: "CAD" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/targets");
    const data = await res.json();
    setTargets(data.targets || []);
    if (data.settings) {
      setSettings(data.settings);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveTarget(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "target",
          symbol: targetForm.symbol,
          targetWeight: Number(targetForm.targetWeight),
          currency: targetForm.currency,
        }),
      });
      setTargetForm({ symbol: "", targetWeight: "", currency: "CAD" });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "settings",
          weeklyContributionAmount: settings.weeklyContributionAmount,
          targetAnnualDividend: settings.targetAnnualDividend,
          targetMonthlyDividend: settings.targetMonthlyDividend,
        }),
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeTarget(id: string) {
    await fetch(`/api/targets?id=${id}`, { method: "DELETE" });
    await load();
  }

  const totalWeight = targets.reduce((sum, target) => sum + target.targetWeight, 0);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-slate-300" />
        </Link>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Targets</h1>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center"><Target className="w-5 h-5 text-gray-600 dark:text-slate-300" /></div>
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">Contribution & dividend goals</div>
            <div className="text-xs text-gray-500 dark:text-slate-400">Set your weekly contribution and dividend targets</div>
          </div>
        </div>
        <form onSubmit={saveSettings} className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <input type="number" step="any" value={settings.weeklyContributionAmount} onChange={(e) => setSettings((p) => ({ ...p, weeklyContributionAmount: Number(e.target.value || 0) }))} placeholder="Weekly contribution" className="h-11 px-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-950" />
          <input type="number" step="any" value={settings.targetAnnualDividend ?? ""} onChange={(e) => setSettings((p) => ({ ...p, targetAnnualDividend: e.target.value === "" ? null : Number(e.target.value) }))} placeholder="Target annual dividend" className="h-11 px-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-950" />
          <input type="number" step="any" value={settings.targetMonthlyDividend ?? ""} onChange={(e) => setSettings((p) => ({ ...p, targetMonthlyDividend: e.target.value === "" ? null : Number(e.target.value) }))} placeholder="Target monthly dividend" className="h-11 px-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-950" />
          <div className="md:col-span-3 flex justify-end">
            <button disabled={saving} className="px-4 py-2.5 text-sm bg-[#0a8043] text-white rounded-xl hover:bg-[#086b39] disabled:opacity-50">Save goals</button>
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">Target allocation</div>
            <div className="text-xs text-gray-500 dark:text-slate-400">Build the symbols you want to fund over time</div>
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400">Total weight: {totalWeight}%</div>
        </div>
        <form onSubmit={saveTarget} className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 border-b border-gray-100 dark:border-slate-800">
          <input value={targetForm.symbol} onChange={(e) => setTargetForm((p) => ({ ...p, symbol: e.target.value.toUpperCase() }))} placeholder="Symbol" className="h-11 px-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-950" />
          <input type="number" step="any" value={targetForm.targetWeight} onChange={(e) => setTargetForm((p) => ({ ...p, targetWeight: e.target.value }))} placeholder="Target weight %" className="h-11 px-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-950" />
          <select value={targetForm.currency} onChange={(e) => setTargetForm((p) => ({ ...p, currency: e.target.value }))} className="h-11 px-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-950">
            <option value="CAD">CAD</option>
            <option value="USD">USD</option>
          </select>
          <div className="md:col-span-3 flex justify-end">
            <button disabled={saving} className="px-4 py-2.5 text-sm bg-[#0a8043] text-white rounded-xl hover:bg-[#086b39] disabled:opacity-50">Add / update target</button>
          </div>
        </form>

        <div className="p-4 space-y-3">
          {targets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 p-6 text-sm text-gray-500 dark:text-slate-400 text-center">No target weights yet.</div>
          ) : (
            targets.map((target) => (
              <div key={target.id} className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4 bg-gray-50/60 dark:bg-slate-950/60 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{target.symbol}</div>
                  <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{target.targetWeight}% target · {target.currency}</div>
                </div>
                <button onClick={() => removeTarget(target.id)} className="px-3 py-2 text-sm text-red-600 border border-red-100 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300">Delete</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

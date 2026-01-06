"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, X, Target, TrendingUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { loadPortfolioSettings } from "@/lib/calculations/allocation";

interface TargetAllocation {
  symbol: string;
  targetWeight: number;
  currency: "CAD" | "USD";
}

interface PortfolioSettings {
  weeklyAmount: number;
  fxFeePercent: number;
  targets: TargetAllocation[];
}

interface PositionSymbol {
  symbol: string;
  symbolMapped: string;
  currency: string;
}

const DEFAULT_SETTINGS: PortfolioSettings = {
  weeklyAmount: 230,
  fxFeePercent: 1.5,
  targets: [],
};

export default function TargetsPage() {
  const [settings, setSettings] = useState<PortfolioSettings>(DEFAULT_SETTINGS);
  const [availableSymbols, setAvailableSymbols] = useState<PositionSymbol[]>([]);
  const [newSymbol, setNewSymbol] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [newCurrency, setNewCurrency] = useState<"CAD" | "USD">("USD");
  const [showAddForm, setShowAddForm] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
    fetchAvailableSymbols();
  }, []);

  async function fetchAvailableSymbols() {
    try {
      const res = await fetch("/api/portfolio");
      const data = await res.json();
      if (data.positions) {
        // Deduplicate by symbolMapped
        const symbolMap = new Map<string, PositionSymbol>();
        for (const p of data.positions as { symbol: string; symbolMapped: string; currency: string }[]) {
          if (!symbolMap.has(p.symbolMapped)) {
            symbolMap.set(p.symbolMapped, {
              symbol: p.symbol,
              symbolMapped: p.symbolMapped,
              currency: p.currency,
            });
          }
        }
        const symbols = Array.from(symbolMap.values());
        // Add CASH option
        symbols.push({ symbol: "CASH", symbolMapped: "CASH", currency: "CAD" });
        setAvailableSymbols(symbols);
      }
    } catch (error) {
      console.error("Failed to fetch symbols:", error);
    }
  }

  async function loadSettings() {
    let loadedFromApi = false;
    try {
      const res = await fetch("/api/settings/portfolio");
      if (res.ok) {
        const data = await res.json();
        // If data is empty (default), check local storage for migration
        if (data.targets && data.targets.length > 0) {
          setSettings(data);
          loadedFromApi = true;
        } else {
          // API works but empty, check local
          const local = loadPortfolioSettings();
          if (local && local.targets.length > 0) {
            setSettings(local);
            // Trigger migration save
            migrateSettings(local);
            loadedFromApi = true;
          } else {
            setSettings(data); // Use default empty from API
          }
        }
      }
    } catch (error) {
      console.error("Failed to load settings from API:", error);
    }

    // Fallback if API completely failed (e.g. server error)
    if (!loadedFromApi) {
      const local = loadPortfolioSettings();
      if (local) {
        setSettings(local);
      }
    }
  }

  async function migrateSettings(data: PortfolioSettings) {
    try {
      await fetch("/api/settings/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch (e) {
      console.error("Migration failed", e);
    }
  }

  async function saveSettings() {
    try {
      const res = await fetch("/api/settings/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }

  function addTarget() {
    if (!newSymbol || !newWeight) return;
    const weight = parseFloat(newWeight);
    if (isNaN(weight) || weight <= 0 || weight > 100) return;

    // Find symbol info from available symbols
    const symbolInfo = availableSymbols.find(
      (s) => s.symbolMapped === newSymbol || s.symbol === newSymbol
    );

    // Use display name (without .TO for CAD symbols)
    const displaySymbol = newSymbol.replace(".TO", "");

    if (settings.targets.some((t) => t.symbol === displaySymbol)) return;

    const currency = symbolInfo?.currency === "CAD" || newSymbol === "CASH" ? "CAD" : "USD";

    setSettings((prev) => ({
      ...prev,
      targets: [
        ...prev.targets,
        { symbol: displaySymbol, targetWeight: weight, currency: currency as "CAD" | "USD" },
      ],
    }));
    setNewSymbol("");
    setNewWeight("");
    setShowAddForm(false);
  }

  // Filter out symbols already in targets
  const filteredSymbols = availableSymbols.filter(
    (s) => !settings.targets.some(
      (t) => t.symbol === s.symbolMapped.replace(".TO", "") || t.symbol === s.symbolMapped
    )
  );

  function removeTarget(symbol: string) {
    setSettings((prev) => ({
      ...prev,
      targets: prev.targets.filter((t) => t.symbol !== symbol),
    }));
  }

  function updateTargetWeight(symbol: string, weight: string) {
    const value = parseFloat(weight);
    if (isNaN(value)) return;
    setSettings((prev) => ({
      ...prev,
      targets: prev.targets.map((t) =>
        t.symbol === symbol ? { ...t, targetWeight: value } : t
      ),
    }));
  }

  const totalWeight = settings.targets.reduce(
    (sum, t) => sum + t.targetWeight,
    0
  );
  const isValidTotal = Math.abs(totalWeight - 100) < 0.01;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - Professional Style */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Portfolio Targets</h1>
            <p className="text-xs text-gray-500">Configure weekly investment allocation</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full">
          <TrendingUp className="w-4 h-4 text-[#0a8043]" />
          <span className="text-xs font-medium text-[#0a8043]">
            C${settings.weeklyAmount}/week
          </span>
        </div>
      </div>

      {/* Weekly Investment Settings */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase mb-3">
          Weekly Investment
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Amount (CAD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                C$
              </span>
              <input
                type="number"
                value={settings.weeklyAmount}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    weeklyAmount: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">FX Fee (%)</label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                value={settings.fxFeePercent}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    fxFeePercent: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-full pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                %
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Target Allocations */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
            Target Allocations
          </h3>
          <div
            className={`text-xs font-medium px-2 py-1 rounded-full ${isValidTotal
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-600"
              }`}
          >
            Total: {totalWeight.toFixed(1)}%
          </div>
        </div>

        {/* Targets List */}
        {settings.targets.length === 0 ? (
          <div className="p-8 text-center">
            <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-gray-900 font-medium mb-1">No targets set</h3>
            <p className="text-sm text-gray-500 mb-4">
              Add your target allocations to plan weekly investments
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {settings.targets.map((target) => (
              <div
                key={target.symbol}
                className="px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-gray-600">
                      {target.symbol.slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">
                      {target.symbol}
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${target.currency === "CAD"
                        ? "bg-red-50 text-red-600"
                        : "bg-blue-50 text-blue-600"
                        }`}
                    >
                      {target.currency}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-20">
                    <input
                      type="number"
                      step="0.1"
                      value={target.targetWeight}
                      onChange={(e) =>
                        updateTargetWeight(target.symbol, e.target.value)
                      }
                      className="w-full pl-2 pr-6 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                      %
                    </span>
                  </div>
                  <button
                    onClick={() => removeTarget(target.symbol)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Form */}
        {showAddForm ? (
          <div className="p-4 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <Select value={newSymbol} onValueChange={setNewSymbol}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select symbol" />
                </SelectTrigger>
                <SelectContent>
                  {filteredSymbols.map((s) => (
                    <SelectItem key={s.symbolMapped} value={s.symbolMapped}>
                      <div className="flex items-center gap-2">
                        <span>{s.symbolMapped.replace(".TO", "")}</span>
                        <span className={`text-[10px] px-1 py-0.5 rounded ${s.currency === "CAD" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                          }`}>
                          {s.currency}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-24">
                <input
                  type="number"
                  placeholder="Weight"
                  step="1"
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTarget()}
                  className="w-full pl-3 pr-6 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                  %
                </span>
              </div>
              <button
                onClick={addTarget}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewSymbol("");
                  setNewWeight("");
                }}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full p-3 border-t border-gray-100 text-sm text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Symbol
          </button>
        )}
      </div>

      {/* Validation Warning */}
      {!isValidTotal && settings.targets.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-sm text-yellow-800">
            Total allocation is {totalWeight.toFixed(1)}%. Adjust to 100% for
            accurate calculations.
          </p>
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={saveSettings}
        className={`w-full py-3 rounded-xl text-sm font-medium transition-colors ${saved
          ? "bg-green-100 text-green-700"
          : "bg-green-600 text-white hover:bg-green-700"
          }`}
      >
        {saved ? "Saved!" : "Save Changes"}
      </button>
    </div>
  );
}

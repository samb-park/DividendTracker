"use client";

import Link from "next/link";
import { ArrowLeft, Cable, Shield } from "lucide-react";
import { useEffect, useState } from "react";

type BrokerStatus = {
  connected: boolean;
  status: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  accountLabel: string | null;
  hasStoredToken?: boolean;
  error?: string;
};

export default function BrokerSettingsPage() {
  const [status, setStatus] = useState<BrokerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshToken, setRefreshToken] = useState("");

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/broker/questrade");
      setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function connectQuestrade(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    try {
      const res = await fetch("/api/broker/questrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json();
      setStatus(data);
      if (res.ok) setRefreshToken("");
      await loadStatus();
    } finally {
      setConnecting(false);
    }
  }

  async function syncAccounts() {
    setConnecting(true);
    try {
      await fetch("/api/broker/questrade/sync", { method: "POST" });
      await loadStatus();
    } finally {
      setConnecting(false);
    }
  }

  async function syncTransactions() {
    setConnecting(true);
    try {
      await fetch("/api/broker/questrade/transactions", { method: "POST" });
      await loadStatus();
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-slate-300" />
        </Link>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Broker connections</h1>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center"><Cable className="w-5 h-5 text-gray-600 dark:text-slate-300" /></div>
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">Questrade</div>
            <div className="text-xs text-gray-500 dark:text-slate-400">Each signed-in user stores and uses their own connection</div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="rounded-2xl border border-emerald-100 dark:border-emerald-500/20 p-4 bg-emerald-50/70 dark:bg-emerald-500/10 flex gap-3">
            <Shield className="w-5 h-5 text-emerald-700 dark:text-emerald-300 mt-0.5" />
            <div className="text-sm text-emerald-900 dark:text-emerald-200">
              Questrade refresh tokens are sensitive. They are stored per user and encrypted before being saved.
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500 dark:text-slate-400">Loading connection status...</div>
          ) : (
            <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4 bg-gray-50/60 dark:bg-slate-950/60 space-y-2">
              <div className="text-sm text-gray-700 dark:text-slate-300">Status: <span className="font-semibold text-gray-900 dark:text-white">{status?.status || "disconnected"}</span></div>
              <div className="text-sm text-gray-700 dark:text-slate-300">Label: <span className="font-semibold text-gray-900 dark:text-white">{status?.accountLabel || "—"}</span></div>
              <div className="text-sm text-gray-700 dark:text-slate-300">Stored token: <span className="font-semibold text-gray-900 dark:text-white">{status?.hasStoredToken ? "Yes" : "No"}</span></div>
              <div className="text-sm text-gray-700 dark:text-slate-300">Last sync status: <span className="font-semibold text-gray-900 dark:text-white">{status?.lastSyncStatus || status?.error || "—"}</span></div>
            </div>
          )}

          <form onSubmit={connectQuestrade} className="space-y-3">
            <textarea
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              placeholder="Paste your Questrade refresh token"
              className="min-h-[110px] w-full px-3 py-3 border border-gray-200 dark:border-slate-700 rounded-xl text-sm resize-y bg-white dark:bg-slate-950 text-gray-900 dark:text-white"
            />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={connecting} className="px-4 py-2.5 text-sm bg-[#0a8043] text-white rounded-xl hover:bg-[#086b39] disabled:opacity-50">
                {connecting ? "Checking..." : "Save token and check connection"}
              </button>
              <button type="button" onClick={syncAccounts} disabled={connecting || !status?.hasStoredToken} className="px-4 py-2.5 text-sm border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50">
                Sync Questrade accounts
              </button>
              <button type="button" onClick={syncTransactions} disabled={connecting || !status?.hasStoredToken} className="px-4 py-2.5 text-sm border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50">
                Sync Questrade transactions
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

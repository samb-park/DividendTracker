"use client";

import Link from "next/link";
import { ArrowLeft, Cable } from "lucide-react";
import { useEffect, useState } from "react";

type BrokerStatus = {
  connected: boolean;
  status: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  accountLabel: string | null;
};

export default function BrokerSettingsPage() {
  const [status, setStatus] = useState<BrokerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

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

  async function connectQuestrade() {
    setConnecting(true);
    try {
      await fetch("/api/broker/questrade", { method: "POST" });
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
            <div className="text-xs text-gray-500 dark:text-slate-400">Use the saved refresh token to verify the connection</div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {loading ? (
            <div className="text-sm text-gray-500 dark:text-slate-400">Loading connection status...</div>
          ) : (
            <div className="rounded-2xl border border-gray-100 dark:border-slate-800 p-4 bg-gray-50/60 dark:bg-slate-950/60 space-y-2">
              <div className="text-sm text-gray-700 dark:text-slate-300">Status: <span className="font-semibold text-gray-900 dark:text-white">{status?.status || "disconnected"}</span></div>
              <div className="text-sm text-gray-700 dark:text-slate-300">Label: <span className="font-semibold text-gray-900 dark:text-white">{status?.accountLabel || "—"}</span></div>
              <div className="text-sm text-gray-700 dark:text-slate-300">Last sync status: <span className="font-semibold text-gray-900 dark:text-white">{status?.lastSyncStatus || "—"}</span></div>
            </div>
          )}

          <button onClick={connectQuestrade} disabled={connecting} className="px-4 py-2.5 text-sm bg-[#0a8043] text-white rounded-xl hover:bg-[#086b39] disabled:opacity-50">
            {connecting ? "Checking..." : "Check Questrade connection"}
          </button>
        </div>
      </div>
    </div>
  );
}

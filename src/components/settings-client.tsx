"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2, CheckCircle, AlertCircle, Loader } from "lucide-react";

interface TokenStatus {
  hasToken: boolean;
  tokenPreview: string | null;
  apiServer: string | null;
  lastSync: string | null;
}

interface SyncResult {
  accountsSynced: number;
  holdingsSynced: number;
  transactionsAdded: number;
  errors: string[];
}

export function SettingsClient() {
  const router = useRouter();
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadStatus = async () => {
    const res = await fetch("/api/questrade/token");
    const data = await res.json();
    setStatus(data);
  };

  useEffect(() => { loadStatus(); }, []);

  const handleSave = async () => {
    if (!tokenInput.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/questrade/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: tokenInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save token");
      setTokenInput("");
      setSuccess("Token validated and saved. Ready to sync.");
      await loadStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setSuccess(null);
    setSyncResult(null);
    try {
      const res = await fetch("/api/questrade/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok && !data.result) throw new Error(data.error ?? "Sync failed");
      setSyncResult(data.result);
      if (data.ok) {
        await loadStatus();
        router.push("/");
      } else {
        setError(data.error ?? "Sync completed with errors");
        await loadStatus();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remove Questrade token?")) return;
    await fetch("/api/questrade/token", { method: "DELETE" });
    setSyncResult(null);
    setSuccess(null);
    setError(null);
    await loadStatus();
  };

  return (
    <div className="space-y-8">
      {/* Questrade Section */}
      <div>
        <div className="text-accent text-xs tracking-widest mb-4">
          QUESTRADE API — BROKER SYNC
        </div>

        {/* How to get a token */}
        <div className="border border-border bg-card p-4 mb-4 text-xs text-muted-foreground space-y-1">
          <div className="text-foreground mb-2 tracking-widest">HOW TO GET A TOKEN:</div>
          <div>1. Login → My Account → App Hub</div>
          <div>2. Generate a new token under "Personal API Access"</div>
          <div>3. Paste it below — tokens expire after 30 days without use</div>
        </div>

        {/* Current token status */}
        {status?.hasToken && (
          <div className="flex items-center justify-between border border-primary/30 bg-primary/5 p-3 mb-4">
            <div className="text-xs space-y-0.5">
              <div className="flex items-center gap-2">
                <CheckCircle size={12} className="text-primary" />
                <span className="text-primary tracking-widest">TOKEN ACTIVE</span>
              </div>
              <div className="text-muted-foreground">
                Ending in {status.tokenPreview}
              </div>
              {status.apiServer && (
                <div className="text-muted-foreground">
                  Server: {status.apiServer.replace("https://", "").replace("/", "")}
                </div>
              )}
              {status.lastSync && (
                <div className="text-muted-foreground">
                  Last sync: {new Date(status.lastSync).toLocaleString("en-CA", {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </div>
              )}
            </div>
            <button
              onClick={handleDelete}
              className="btn-retro text-negative border-negative/30 hover:border-negative p-1"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}

        {/* Token input */}
        <div className="space-y-2">
          <label className="text-[10px] tracking-widest text-muted-foreground">
            {status?.hasToken ? "REPLACE TOKEN" : "REFRESH TOKEN"}
          </label>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Paste Questrade refresh token..."
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button
            onClick={handleSave}
            disabled={saving || !tokenInput.trim()}
            className="btn-retro btn-retro-primary w-full py-2 disabled:opacity-40"
          >
            {saving ? "VALIDATING..." : "[ SAVE TOKEN ]"}
          </button>
        </div>

        {/* Sync button */}
        {status?.hasToken && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-retro btn-retro-primary w-full py-2 mt-3 flex items-center justify-center gap-2"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "SYNCING..." : "[ SYNC FROM QUESTRADE ]"}
          </button>
        )}

        {/* Feedback messages */}
        {success && (
          <div className="flex items-center gap-2 text-xs text-primary mt-3">
            <CheckCircle size={12} />
            {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-xs text-negative mt-3">
            <AlertCircle size={12} />
            {error}
          </div>
        )}

        {/* Sync result */}
        {syncResult && (
          <div className="border border-border bg-card p-4 mt-4 text-xs space-y-2">
            <div className="text-accent tracking-widest mb-2">SYNC RESULT</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-medium tabular-nums text-primary">
                  {syncResult.accountsSynced}
                </div>
                <div className="text-muted-foreground text-[10px]">ACCOUNTS</div>
              </div>
              <div>
                <div className="text-lg font-medium tabular-nums text-primary">
                  {syncResult.holdingsSynced}
                </div>
                <div className="text-muted-foreground text-[10px]">HOLDINGS</div>
              </div>
              <div>
                <div className="text-lg font-medium tabular-nums text-primary">
                  {syncResult.transactionsAdded}
                </div>
                <div className="text-muted-foreground text-[10px]">NEW TXN</div>
              </div>
            </div>
            {syncResult.errors.length > 0 && (
              <div className="text-negative space-y-1 pt-2 border-t border-border">
                {syncResult.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {!status && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs mt-4">
            <Loader size={12} className="animate-spin" />
            Loading...
          </div>
        )}
      </div>

      {/* App Info */}
      <div>
        <div className="text-accent text-xs tracking-widest mb-4">APP INFO</div>
        <div className="border border-border bg-card p-4 text-xs text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>VERSION</span>
            <span>2.0.0</span>
          </div>
          <div className="flex justify-between">
            <span>MARKET DATA</span>
            <span>YAHOO FINANCE</span>
          </div>
          <div className="flex justify-between">
            <span>BROKER SYNC</span>
            <span>QUESTRADE API</span>
          </div>
        </div>
      </div>
    </div>
  );
}

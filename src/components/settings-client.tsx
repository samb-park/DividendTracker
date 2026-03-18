"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2, CheckCircle, AlertCircle, Loader } from "lucide-react";
import { AddPortfolioDialog } from "./add-portfolio-dialog";

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
  cashTransactionsAdded: number;
  errors: string[];
}

interface PortfolioItem {
  id: string;
  name: string;
}

export function SettingsClient({ portfolios: initialPortfolios }: { portfolios: PortfolioItem[] }) {
  const router = useRouter();
  const [portfolios, setPortfolios] = useState(initialPortfolios);
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [tickers, setTickers] = useState<string[]>([]);
  const [contribFreq, setContribFreq] = useState<"weekly" | "biweekly" | "monthly">("monthly");
  const [contribAmount, setContribAmount] = useState("");
  const [contribCurrency, setContribCurrency] = useState<"USD" | "CAD">("CAD");
  const [targets, setTargets] = useState<Record<string, { pct: string }>>({});
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingTargets, setSavingTargets] = useState(false);
  const [confirmDeletePortfolioId, setConfirmDeletePortfolioId] = useState<string | null>(null);
  const [confirmDeleteToken, setConfirmDeleteToken] = useState(false);

  const loadStatus = async () => {
    const res = await fetch("/api/questrade/token");
    const data = await res.json();
    setStatus(data);
  };

  useEffect(() => { loadStatus(); }, []);

  useEffect(() => {
    fetch("/api/settings/investment").then(r => r.json()).then(data => {
      setTickers(data.tickers ?? []);
      if (data.contribution) {
        setContribFreq(data.contribution.frequency);
        setContribAmount(String(data.contribution.amount));
        setContribCurrency(data.contribution.currency);
      }
      const t: Record<string, { pct: string }> = {};
      for (const [tk, v] of Object.entries(data.targets ?? {})) {
        t[tk] = { pct: String((v as any).pct) };
      }
      setTargets(t);
    });
  }, []);

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

  const handleDeleteToken = async () => {
    await fetch("/api/questrade/token", { method: "DELETE" });
    setConfirmDeleteToken(false);
    setSyncResult(null);
    setSuccess(null);
    setError(null);
    await loadStatus();
  };

  const refreshPortfolios = async () => {
    const res = await fetch("/api/portfolios");
    const data = await res.json();
    setPortfolios(data.map((p: any) => ({ id: p.id, name: p.name })));
  };

  const deletePortfolio = async (id: string) => {
    await fetch(`/api/portfolios/${id}`, { method: "DELETE" });
    setConfirmDeletePortfolioId(null);
    await refreshPortfolios();
  };

  return (
    <div className="space-y-8">
      {/* Portfolio Management */}
      <div>
        <div className="text-accent text-xs tracking-wide mb-4">
          PORTFOLIO MANAGEMENT
        </div>
        <div className="border border-border bg-card p-4 space-y-3">
          {portfolios.length === 0 ? (
            <div className="text-muted-foreground text-xs text-center py-4">NO PORTFOLIOS</div>
          ) : (
            portfolios.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm gap-2">
                <span className="truncate">{p.name}</span>
                {confirmDeletePortfolioId === p.id ? (
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => deletePortfolio(p.id)} className="btn-retro text-xs text-negative border-negative/30 hover:border-negative px-2 py-0.5">CONFIRM</button>
                    <button onClick={() => setConfirmDeletePortfolioId(null)} className="btn-retro text-xs px-2 py-0.5">CANCEL</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeletePortfolioId(p.id)} className="btn-retro text-negative border-negative/30 hover:border-negative p-1 flex-shrink-0">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))
          )}
          <div className="pt-2 border-t border-border">
            <AddPortfolioDialog onAdd={async () => { await refreshPortfolios(); router.refresh(); }} />
          </div>
        </div>
      </div>

      {/* Questrade Section */}
      <div>
        <div className="text-accent text-xs tracking-wide mb-4">
          QUESTRADE API — BROKER SYNC
        </div>

        {/* How to get a token */}
        <div className="border border-border bg-card p-4 mb-4 text-xs text-muted-foreground space-y-1">
          <div className="text-foreground mb-2 tracking-wide">HOW TO GET A TOKEN:</div>
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
                <span className="text-primary tracking-wide">TOKEN ACTIVE</span>
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
            {confirmDeleteToken ? (
              <div className="flex gap-1">
                <button onClick={handleDeleteToken} className="btn-retro text-xs text-negative border-negative/30 hover:border-negative px-2 py-0.5">CONFIRM</button>
                <button onClick={() => setConfirmDeleteToken(false)} className="btn-retro text-xs px-2 py-0.5">CANCEL</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDeleteToken(true)} className="btn-retro text-negative border-negative/30 hover:border-negative p-1">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}

        {/* Token input */}
        <div className="space-y-2">
          <label className="text-[10px] tracking-wide text-muted-foreground">
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
            <div className="text-accent tracking-wide mb-2">SYNC RESULT</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
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
              <div>
                <div className="text-lg font-medium tabular-nums text-primary">
                  {syncResult.cashTransactionsAdded ?? 0}
                </div>
                <div className="text-muted-foreground text-[10px]">NEW DEPOSITS</div>
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

      {/* Contribution Plan */}
      <div>
        <div className="text-accent text-xs tracking-wide mb-4">CONTRIBUTION PLAN</div>
        <div className="border border-border bg-card p-4 space-y-4">
          <div>
            <div className="text-[10px] tracking-wide text-muted-foreground mb-2">FREQUENCY</div>
            <div className="flex gap-2">
              {(["weekly", "biweekly", "monthly"] as const).map(f => (
                <button key={f}
                  className={`btn-retro text-xs ${contribFreq === f ? "btn-retro-primary" : ""}`}
                  onClick={() => setContribFreq(f)}>
                  [{f === "biweekly" ? "BI-WEEKLY" : f.toUpperCase()}]
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="number" min="0" step="any"
              value={contribAmount} onChange={e => setContribAmount(e.target.value)}
              placeholder="500" className="flex-1" />
            {(["USD", "CAD"] as const).map(c => (
              <button key={c}
                className={`btn-retro text-xs ${contribCurrency === c ? "btn-retro-primary" : ""}`}
                onClick={() => setContribCurrency(c)}>[{c}]</button>
            ))}
          </div>
          <button
            disabled={savingPlan || !contribAmount}
            onClick={async () => {
              setSavingPlan(true);
              await fetch("/api/settings/investment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "contribution", frequency: contribFreq, amount: parseFloat(contribAmount), currency: contribCurrency }),
              });
              setSavingPlan(false);
            }}
            className="btn-retro btn-retro-primary w-full py-2 disabled:opacity-40">
            {savingPlan ? "SAVING..." : "[ SAVE PLAN ]"}
          </button>
        </div>
      </div>

      {/* Ticker Targets */}
      {tickers.length > 0 && (
        <div>
          <div className="text-accent text-xs tracking-wide mb-4">TICKER TARGETS</div>
          <div className="border border-border bg-card p-4 space-y-3">
            {(() => {
              const total = tickers.reduce((s, t) => s + (parseFloat(targets[t]?.pct || "0") || 0), 0);
              const ok = Math.abs(total - 100) < 0.01;
              return (
                <div className={`flex items-center justify-between text-[10px] mb-2 ${ok ? "text-positive" : total > 100 ? "text-negative" : "text-muted-foreground"}`}>
                  <span>ALLOCATION TARGET (%) — MUST SUM TO 100</span>
                  <span className="tabular-nums font-medium">{total.toFixed(1)}%</span>
                </div>
              );
            })()}
            {tickers.map(ticker => {
              const t = targets[ticker] ?? { pct: "" };
              return (
                <div key={ticker} className="flex items-center gap-2">
                  <span className="text-xs font-medium w-16 shrink-0">{ticker}</span>
                  <input type="number" min="0" max="100" step="any" placeholder="0"
                    value={t.pct}
                    onChange={e => setTargets(prev => ({ ...prev, [ticker]: { pct: e.target.value } }))}
                    className="flex-1 !py-1" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              );
            })}
            <button
              disabled={savingTargets}
              className="btn-retro btn-retro-primary w-full py-2 text-xs disabled:opacity-40 mt-2"
              onClick={async () => {
                setSavingTargets(true);
                await Promise.all(
                  tickers
                    .filter(ticker => targets[ticker]?.pct)
                    .map(ticker =>
                      fetch("/api/settings/investment", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ type: "target", ticker, pct: parseFloat(targets[ticker].pct) }),
                      })
                    )
                );
                setSavingTargets(false);
              }}>
              {savingTargets ? "SAVING..." : "[ SAVE ALL ]"}
            </button>
          </div>
        </div>
      )}

      {/* App Info */}
      <div>
        <div className="text-accent text-xs tracking-wide mb-4">APP INFO</div>
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

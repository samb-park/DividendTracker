"use client";

import { useState, useEffect, useMemo } from "react";
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
  accountType: string;
  cashCAD: string | null;
  cashUSD: string | null;
}

function Section({
  title, children, defaultOpen = false, badge,
}: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-border/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-accent text-xs tracking-wide">{title}</span>
          {badge && <span className="text-[10px] text-positive border border-positive/30 px-1.5 py-0.5">{badge}</span>}
        </div>
        <span className="text-muted-foreground text-[10px]">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="p-4 border-t border-border space-y-4">{children}</div>}
    </div>
  );
}

const GOAL_OPTIONS = [
  { value: "retirement", label: "RETIREMENT" },
  { value: "house", label: "HOME PURCHASE" },
  { value: "education", label: "EDUCATION" },
  { value: "short_term", label: "SHORT-TERM" },
  { value: "passive_income", label: "PASSIVE INCOME" },
  { value: "wealth_building", label: "WEALTH BUILDING" },
] as const;

export function SettingsClient({ portfolios: initialPortfolios, isAdmin = false }: { portfolios: PortfolioItem[]; isAdmin?: boolean }) {
  const router = useRouter();
  const [portfolios, setPortfolios] = useState(initialPortfolios);
  const [cashEdits, setCashEdits] = useState<Record<string, { cad: string; usd: string }>>({});
  const [savingCash, setSavingCash] = useState<string | null>(null);
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
  const [goalAmount, setGoalAmount] = useState("");
  const [goalCurrency, setGoalCurrency] = useState<"CAD" | "USD">("CAD");
  const [savingGoal, setSavingGoal] = useState(false);
  const [confirmDeletePortfolioId, setConfirmDeletePortfolioId] = useState<string | null>(null);
  const [confirmDeleteToken, setConfirmDeleteToken] = useState(false);

  // TFSA/RRSP contribution limits
  const CURRENT_YEAR = new Date().getFullYear();
  const TFSA_ANNUAL_LIMIT = 7000; // 2026 limit
  const FHSA_ANNUAL_LIMIT = 8000; // 2026 limit
  interface ContribRoom { tfsaCarryover: string; rrspLimit: string; fhsaCarryover: string }
  const [contribRoom, setContribRoom] = useState<ContribRoom>({ tfsaCarryover: "", rrspLimit: "", fhsaCarryover: "" });
  const [contribDeposits, setContribDeposits] = useState<{ tfsa: number; rrsp: number; fhsa: number }>({ tfsa: 0, rrsp: 0, fhsa: 0 });
  const [savingRoom, setSavingRoom] = useState(false);
  const [savedRoom, setSavedRoom] = useState(false);
  const [savedPlan, setSavedPlan] = useState(false);
  const [savedGoal, setSavedGoal] = useState(false);
  const [savedTargets, setSavedTargets] = useState(false);

  // Investor profile
  const [profileAge, setProfileAge] = useState("");
  const [profileGoals, setProfileGoals] = useState<string[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);
  const [fxRate, setFxRate] = useState(1.35);

  const targetTotal = useMemo(
    () => tickers.reduce((s, t) => s + (parseFloat(targets[t]?.pct || "0") || 0), 0),
    [tickers, targets]
  );

  const loadStatus = async () => {
    const res = await fetch("/api/questrade/token");
    const data = await res.json();
    setStatus(data);
  };

  useEffect(() => { loadStatus(); }, []);

  useEffect(() => {
    fetch("/api/fx").then(r => r.json()).then(d => { if (d.rate) setFxRate(d.rate); }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/settings/investment").then(r => r.json()).then(data => {
      setTickers(data.tickers ?? []);
      if (data.contribution) {
        setContribFreq(data.contribution.frequency);
        setContribAmount(String(data.contribution.amount));
        setContribCurrency(data.contribution.currency);
      }
      if (data.incomeGoal) {
        setGoalAmount(String(data.incomeGoal.annualTarget));
        setGoalCurrency(data.incomeGoal.currency);
      }
      if (data.contribRoom) {
        setContribRoom(data.contribRoom);
      }
      if (data.investorProfile) {
        setProfileAge(String(data.investorProfile.birthYear ?? ""));
        setProfileGoals(data.investorProfile.goals ?? []);
      }
      const t: Record<string, { pct: string }> = {};
      for (const [tk, v] of Object.entries(data.targets ?? {})) {
        t[tk] = { pct: String((v as any).pct) };
      }
      setTargets(t);
    });
  }, []);

  useEffect(() => {
    // Compute this year's deposits per account type from cash transactions
    fetch(`/api/cash-transactions?year=${CURRENT_YEAR}`)
      .then(r => r.json())
      .then(d => {
        let tfsa = 0, rrsp = 0, fhsa = 0;
        for (const item of (d.items ?? [])) {
          if (item.action !== "DEPOSIT") continue;
          const acctType = (item.portfolioAccountType ?? "").toUpperCase();
          const amount = item.currency === "USD" ? item.amount * fxRate : item.amount;
          if (acctType === "TFSA") tfsa += amount;
          else if (acctType === "RRSP") rrsp += amount;
          else if (acctType === "FHSA") fhsa += amount;
        }
        setContribDeposits({ tfsa, rrsp, fhsa });
      })
      .catch(() => {});
  }, [CURRENT_YEAR]);

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
    setPortfolios(data.map((p: any) => ({
      id: p.id,
      name: p.name,
      accountType: p.accountType ?? "NON_REG",
      cashCAD: p.cashCAD ?? null,
      cashUSD: p.cashUSD ?? null,
    })));
  };

  const handleSaveCash = async (id: string) => {
    const edit = cashEdits[id];
    if (!edit) return;
    setSavingCash(id);
    try {
      const res = await fetch(`/api/portfolios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashCAD: edit.cad ? parseFloat(edit.cad) : 0,
          cashUSD: edit.usd ? parseFloat(edit.usd) : 0,
        }),
      });
      if (!res.ok) { alert("Failed to save."); return; }
      setCashEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
      await refreshPortfolios();
    } catch {
      alert("Failed to save.");
    } finally {
      setSavingCash(null);
    }
  };

  const deletePortfolio = async (id: string) => {
    try {
      await fetch(`/api/portfolios/${id}`, { method: "DELETE" });
      setConfirmDeletePortfolioId(null);
      await refreshPortfolios();
    } catch {
      setConfirmDeletePortfolioId(null);
    }
  };

  return (
    <div className="space-y-2">
      {/* Portfolio Management */}
      <Section title="PORTFOLIO MANAGEMENT" defaultOpen={true}>
        <div className="space-y-3">
          {portfolios.length === 0 ? (
            <div className="text-muted-foreground text-xs text-center py-4">NO PORTFOLIOS</div>
          ) : (
            portfolios.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm gap-2">
                <span className="truncate">{p.name}</span>
                <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 flex-shrink-0">{p.accountType}</span>
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
      </Section>

      {/* Questrade Section */}
      <Section title="QUESTRADE API — BROKER SYNC" defaultOpen={true} badge={status?.hasToken ? "ACTIVE" : undefined}>
        <div className="space-y-4">
        {/* How to get a token */}
        <div className="border border-border bg-card p-4 text-xs text-muted-foreground space-y-1">
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
            type="text"
            autoComplete="off"
            spellCheck={false}
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
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Loader size={12} className="animate-spin" />
            Loading...
          </div>
        )}
        </div>
      </Section>

      {/* Investor Profile */}
      <Section title="INVESTOR PROFILE — AI PERSONALIZATION" defaultOpen={profileGoals.length === 0} badge={profileGoals.length > 0 ? "SET" : undefined}>
        <div className="text-[10px] text-muted-foreground">Set your birth year and investment goals for personalized AI briefings.</div>
        <div>
          <div className="text-[10px] tracking-wide text-muted-foreground mb-2">BIRTH YEAR</div>
          <input
            type="number" min="1940" max={new Date().getFullYear() - 18} placeholder="e.g. 1986"
            value={profileAge}
            onChange={e => setProfileAge(e.target.value)}
            className="w-32 !py-1 text-xs"
          />
        </div>
        <div>
          <div className="text-[10px] tracking-wide text-muted-foreground mb-2">INVESTMENT GOALS (select all that apply)</div>
          <div className="flex flex-wrap gap-2">
            {GOAL_OPTIONS.map(g => (
              <button
                key={g.value}
                onClick={() => setProfileGoals(prev =>
                  prev.includes(g.value) ? prev.filter(x => x !== g.value) : [...prev, g.value]
                )}
                className={`btn-retro text-xs px-2 py-1 ${profileGoals.includes(g.value) ? "btn-retro-primary" : ""}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <button
          disabled={savingProfile || !profileAge || profileGoals.length === 0}
          onClick={async () => {
            setSavingProfile(true);
            await fetch("/api/settings/investment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "investor_profile", birthYear: parseInt(profileAge), goals: profileGoals }),
            });
            setSavingProfile(false);
            setSavedProfile(true);
            setTimeout(() => setSavedProfile(false), 2000);
          }}
          className="btn-retro btn-retro-primary w-full py-2 disabled:opacity-40"
        >
          {savingProfile ? "SAVING..." : savedProfile ? "SAVED ✓" : "[ SAVE PROFILE ]"}
        </button>
      </Section>

      {/* Contribution Plan */}
      <Section title="CONTRIBUTION PLAN" defaultOpen={false}>
        <div className="space-y-4">
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
              setSavedPlan(true);
              setTimeout(() => setSavedPlan(false), 2000);
            }}
            className="btn-retro btn-retro-primary w-full py-2 disabled:opacity-40">
            {savingPlan ? "SAVING..." : savedPlan ? "SAVED ✓" : "[ SAVE PLAN ]"}
          </button>
        </div>
      </Section>

      {/* Income Goal */}
      <Section title="INCOME GOAL" defaultOpen={false}>
        <div className="space-y-4">
          <div className="text-[10px] text-muted-foreground">Annual dividend income target</div>
          <div className="flex items-center gap-2">
            <input type="number" min="0" step="any"
              value={goalAmount} onChange={e => setGoalAmount(e.target.value)}
              placeholder="12000" className="flex-1" />
            {(["CAD", "USD"] as const).map(c => (
              <button key={c}
                className={`btn-retro text-xs ${goalCurrency === c ? "btn-retro-primary" : ""}`}
                onClick={() => setGoalCurrency(c)}>[{c}]</button>
            ))}
          </div>
          <button
            disabled={savingGoal || !goalAmount}
            onClick={async () => {
              setSavingGoal(true);
              await fetch("/api/settings/investment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "income_goal", annualTarget: parseFloat(goalAmount), currency: goalCurrency }),
              });
              setSavingGoal(false);
              setSavedGoal(true);
              setTimeout(() => setSavedGoal(false), 2000);
            }}
            className="btn-retro btn-retro-primary w-full py-2 disabled:opacity-40">
            {savingGoal ? "SAVING..." : savedGoal ? "SAVED ✓" : "[ SAVE GOAL ]"}
          </button>
        </div>
      </Section>

      {/* Ticker Targets */}
      {tickers.length > 0 && (
        <Section title="TICKER TARGETS" defaultOpen={false}>
          <div className="space-y-3">
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
            {targetTotal > 100.01 && !savingTargets && (
              <div className="flex items-center gap-1 text-[10px] text-negative border border-negative/30 bg-negative/5 px-2 py-1 mt-1">
                <span>⚠</span>
                <span>TOTAL {targetTotal.toFixed(1)}% EXCEEDS 100% — ADJUST BEFORE SAVING</span>
              </div>
            )}
            <button
              disabled={savingTargets || targetTotal > 100.01}
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
                setSavedTargets(true);
                setTimeout(() => setSavedTargets(false), 2000);
              }}>
              {savingTargets ? "SAVING..." : savedTargets ? "SAVED ✓" : "[ SAVE ALL ]"}
            </button>
          </div>
        </Section>
      )}

      {/* Contribution Room */}
      <Section title={`CONTRIBUTION ROOM — ${CURRENT_YEAR}`} defaultOpen={false}>
        <div className="space-y-5">
          <div className="text-[10px] text-muted-foreground">Track TFSA / RRSP / FHSA room. Enter your carryover to see remaining space.</div>

          {/* TFSA */}
          {(() => {
            const carryover = parseFloat(contribRoom.tfsaCarryover) || 0;
            const total = TFSA_ANNUAL_LIMIT + carryover;
            const used = contribDeposits.tfsa;
            const overContributed = used > total;
            const remaining = Math.max(0, total - used);
            const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary">TFSA</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    Used C${used.toLocaleString("en-CA", { maximumFractionDigits: 0 })} / C${total.toLocaleString("en-CA", { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="h-1.5 bg-border overflow-hidden">
                  <div className={`h-full ${pct >= 90 ? "bg-negative" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                </div>
                {overContributed ? (
                  <div className="text-xs tabular-nums text-negative font-medium">
                    ⚠ OVER-CONTRIBUTED by C${(used - total).toLocaleString("en-CA", { maximumFractionDigits: 0 })} — CRA charges 1%/month on excess
                  </div>
                ) : (
                  <div className={`text-xs tabular-nums ${remaining > 0 ? "text-positive" : "text-negative"}`}>
                    C${remaining.toLocaleString("en-CA", { maximumFractionDigits: 0 })} remaining
                    <span className="text-muted-foreground ml-1">(annual ${TFSA_ANNUAL_LIMIT.toLocaleString()} + carryover)</span>
                  </div>
                )}
                <div>
                  <div className="text-[10px] text-muted-foreground tracking-wide mb-1">CARRYOVER FROM PRIOR YEARS</div>
                  <input type="number" min="0" step="any" placeholder="0"
                    value={contribRoom.tfsaCarryover}
                    onChange={e => setContribRoom(r => ({ ...r, tfsaCarryover: e.target.value }))}
                    className="w-full !py-1 text-xs" />
                </div>
              </div>
            );
          })()}

          {/* RRSP */}
          {(() => {
            const limit = parseFloat(contribRoom.rrspLimit) || 0;
            const used = contribDeposits.rrsp;
            const remaining = Math.max(0, limit - used);
            const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-accent">RRSP</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    Used C${used.toLocaleString("en-CA", { maximumFractionDigits: 0 })} / C${limit.toLocaleString("en-CA", { maximumFractionDigits: 0 })}
                  </span>
                </div>
                {limit > 0 && (
                  <div className="h-1.5 bg-border overflow-hidden">
                    <div className={`h-full ${pct >= 90 ? "bg-negative" : "bg-accent"}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
                <div className={`text-xs tabular-nums ${limit > 0 ? (remaining > 0 ? "text-positive" : "text-negative") : "text-muted-foreground"}`}>
                  {limit > 0 ? `C$${remaining.toLocaleString("en-CA", { maximumFractionDigits: 0 })} remaining` : "Enter your limit from your NOA"}
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground tracking-wide mb-1">MY DEDUCTION LIMIT (FROM NOA)</div>
                  <input type="number" min="0" step="any" placeholder="e.g. 45000"
                    value={contribRoom.rrspLimit}
                    onChange={e => setContribRoom(r => ({ ...r, rrspLimit: e.target.value }))}
                    className="w-full !py-1 text-xs" />
                </div>
              </div>
            );
          })()}

          {/* FHSA */}
          {(() => {
            const carryover = parseFloat(contribRoom.fhsaCarryover) || 0;
            const total = FHSA_ANNUAL_LIMIT + carryover;
            const used = contribDeposits.fhsa;
            const remaining = Math.max(0, total - used);
            const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: "hsl(var(--chart-3))" }}>FHSA</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    Used C${used.toLocaleString("en-CA", { maximumFractionDigits: 0 })} / C${total.toLocaleString("en-CA", { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="h-1.5 bg-border overflow-hidden">
                  <div className={`h-full ${pct >= 90 ? "bg-negative" : ""}`} style={{ width: `${pct}%`, backgroundColor: pct >= 90 ? undefined : "hsl(var(--chart-3))" }} />
                </div>
                <div className={`text-xs tabular-nums ${remaining > 0 ? "text-positive" : "text-negative"}`}>
                  C${remaining.toLocaleString("en-CA", { maximumFractionDigits: 0 })} remaining
                  <span className="text-muted-foreground ml-1">(annual ${FHSA_ANNUAL_LIMIT.toLocaleString()} + carryover, $40K lifetime)</span>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground tracking-wide mb-1">CARRYOVER FROM PRIOR YEAR (MAX $8K)</div>
                  <input type="number" min="0" max="8000" step="any" placeholder="0"
                    value={contribRoom.fhsaCarryover}
                    onChange={e => setContribRoom(r => ({ ...r, fhsaCarryover: e.target.value }))}
                    className="w-full !py-1 text-xs" />
                </div>
              </div>
            );
          })()}

          <button
            disabled={savingRoom}
            onClick={async () => {
              setSavingRoom(true);
              await fetch("/api/settings/investment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "contrib_room", ...contribRoom }),
              });
              setSavingRoom(false);
              setSavedRoom(true);
              setTimeout(() => setSavedRoom(false), 2000);
            }}
            className="btn-retro btn-retro-primary w-full py-2 text-xs disabled:opacity-40"
          >
            {savingRoom ? "SAVING..." : savedRoom ? "SAVED ✓" : "[ SAVE ROOM ]"}
          </button>
        </div>
      </Section>

      {/* Cash Balances */}
      <Section title="CASH BALANCES" defaultOpen={false}>
        <div className="space-y-4">
          <div className="text-[10px] text-muted-foreground">Current cash per account (CAD + USD)</div>
          {portfolios.map((p) => {
            const edit = cashEdits[p.id];
            const cadVal = edit?.cad ?? (p.cashCAD ? parseFloat(p.cashCAD).toFixed(2) : "0.00");
            const usdVal = edit?.usd ?? (p.cashUSD ? parseFloat(p.cashUSD).toFixed(2) : "0.00");
            return (
              <div key={p.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-accent">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5">{p.accountType}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] text-muted-foreground tracking-wide mb-1">CAD ($)</div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cadVal}
                      onChange={e => setCashEdits(prev => ({
                        ...prev,
                        [p.id]: { cad: e.target.value, usd: prev[p.id]?.usd ?? usdVal },
                      }))}
                      className="w-full !py-1 text-xs"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground tracking-wide mb-1">USD ($)</div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={usdVal}
                      onChange={e => setCashEdits(prev => ({
                        ...prev,
                        [p.id]: { cad: prev[p.id]?.cad ?? cadVal, usd: e.target.value },
                      }))}
                      className="w-full !py-1 text-xs"
                    />
                  </div>
                </div>
                {cashEdits[p.id] && (
                  <button
                    disabled={savingCash === p.id}
                    onClick={() => handleSaveCash(p.id)}
                    className="btn-retro btn-retro-primary text-xs px-3 py-1 w-full disabled:opacity-40"
                  >
                    {savingCash === p.id ? "SAVING..." : "[ SAVE CASH ]"}
                  </button>
                )}
              </div>
            );
          })}
          {portfolios.length === 0 && (
            <div className="text-muted-foreground text-xs text-center py-4">NO PORTFOLIOS</div>
          )}
        </div>
      </Section>

      {/* Admin */}
      {isAdmin && (
        <Section title="ADMIN" defaultOpen={false} badge="ADMIN">
          <div className="space-y-3">
            <div className="text-[10px] text-muted-foreground">Admin-only tools. Not visible to regular users.</div>
            <a
              href="/admin"
              className="btn-retro btn-retro-primary w-full py-2 text-xs text-center block"
            >
              [ USER MANAGEMENT ]
            </a>
          </div>
        </Section>
      )}

      {/* App Info */}
      <Section title="APP INFO" defaultOpen={false}>
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex justify-between"><span>VERSION</span><span>2.0.0</span></div>
          <div className="flex justify-between"><span>MARKET DATA</span><span>YAHOO FINANCE</span></div>
          <div className="flex justify-between"><span>BROKER SYNC</span><span>QUESTRADE API</span></div>
          <div className="flex justify-between"><span>AI</span><span>CODEX CLI (OAUTH)</span></div>
        </div>
      </Section>
    </div>
  );
}

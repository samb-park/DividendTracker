"use client";

import { useState, useEffect } from "react";

type Tab = "BRIEFING" | "INSIGHTS";

interface AiState {
  result: string | null;
  cached: boolean;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: AiState = { result: null, cached: false, loading: false, error: null };

export function AiPanel() {
  const [tab, setTab] = useState<Tab>("BRIEFING");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [maxCalls, setMaxCalls] = useState<number>(2);
  const [isAdmin, setIsAdmin] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [briefing, setBriefing] = useState<AiState>(INITIAL_STATE);
  const [insights, setInsights] = useState<AiState>(INITIAL_STATE);

  async function fetchBriefing() {
    setBriefing((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/ai/briefing", { method: "POST" });
      const data = await res.json() as { result?: string; cached?: boolean; remaining?: number; error?: string };
      if (data.remaining !== undefined) setRemaining(data.remaining);
      if (!res.ok) {
        setBriefing({ result: null, cached: false, loading: false, error: data.error ?? "Failed" });
      } else {
        setBriefing({ result: data.result ?? null, cached: data.cached ?? false, loading: false, error: null });
      }
    } catch {
      setBriefing({ result: null, cached: false, loading: false, error: "Network error" });
    }
  }

  async function fetchInsights() {
    setInsights((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/ai/insights", { method: "POST" });
      const data = await res.json() as { result?: string; cached?: boolean; remaining?: number; error?: string };
      if (data.remaining !== undefined) setRemaining(data.remaining);
      if (!res.ok) {
        setInsights({ result: null, cached: false, loading: false, error: data.error ?? "Failed" });
      } else {
        setInsights({ result: data.result ?? null, cached: data.cached ?? false, loading: false, error: null });
      }
    } catch {
      setInsights({ result: null, cached: false, loading: false, error: "Network error" });
    }
  }

  // Auto-load both on mount (24h cache — real AI call only once per day)
  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d: { isAdmin?: boolean; remaining?: number; maxCalls?: number }) => {
        setIsAdmin(d.isAdmin ?? false);
        if (d.remaining !== undefined) setRemaining(d.remaining);
        if (d.maxCalls !== undefined) setMaxCalls(d.maxCalls);
      })
      .catch(() => {});
    fetchBriefing();
    fetchInsights();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function clearCache() {
    setClearingCache(true);
    await fetch("/api/ai/cache", { method: "DELETE" });
    setClearingCache(false);
    setBriefing(INITIAL_STATE);
    setInsights(INITIAL_STATE);
    fetchBriefing();
    fetchInsights();
  }

  const tabs: Tab[] = ["BRIEFING", "INSIGHTS"];
  const current = tab === "BRIEFING" ? briefing : insights;
  const onRefresh = tab === "BRIEFING" ? fetchBriefing : fetchInsights;

  return (
    <div className="border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="text-accent text-xs tracking-wide">AI ASSISTANT</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {remaining !== null ? `${remaining}/${maxCalls} CALLS TODAY` : ""}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`btn-retro text-xs px-4 py-2 border-0 border-r border-border ${
              tab === t ? "btn-retro-primary" : ""
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {current.loading && (
          <div className="text-xs text-muted-foreground py-4 text-center">ANALYZING...</div>
        )}

        {current.error && !current.loading && (
          <div className="text-xs text-negative">{current.error}</div>
        )}

        {current.result && !current.loading && (
          <div className="text-xs whitespace-pre-wrap leading-relaxed text-foreground border border-border bg-background p-3">
            {current.result}
          </div>
        )}

        {/* Footer row: cache badge + admin buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {current.cached && !current.loading && (
            <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5">
              CACHED
            </span>
          )}
          {remaining === 0 && !current.loading && (
            <span className="text-[10px] text-negative">DAILY LIMIT REACHED</span>
          )}

          {isAdmin && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={clearCache}
                disabled={clearingCache || current.loading}
                className="btn-retro text-[10px] px-2 py-0.5 text-negative border-negative/30 hover:border-negative disabled:opacity-30"
              >
                {clearingCache ? "CLEARING..." : "[ CLEAR CACHE ]"}
              </button>
              <button
                onClick={onRefresh}
                disabled={current.loading || remaining === 0 || remaining === null}
                className="btn-retro text-[10px] px-2 py-0.5 disabled:opacity-30"
              >
                [ REFRESH ]
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

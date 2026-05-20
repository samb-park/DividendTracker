"use client";

import { useState, useEffect } from "react";
import { sanitizeAiOutput } from "@/lib/ai-output-rules";
import { AI_REFRESH_EVENT } from "@/components/ai-page-refresh";

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
  const [briefing, setBriefing] = useState<AiState>(INITIAL_STATE);
  const [insights, setInsights] = useState<AiState>(INITIAL_STATE);

  async function fetchBriefing(opts: { force?: boolean } = {}) {
    setBriefing((s) => ({ ...s, loading: true, error: null }));
    try {
      const url = opts.force ? "/api/ai/briefing?force=1" : "/api/ai/briefing";
      const res = await fetch(url, { method: "POST" });
      const data = (await res.json()) as { result?: string; cached?: boolean; error?: string };
      if (!res.ok) {
        setBriefing({ result: null, cached: false, loading: false, error: data.error ?? "Failed" });
      } else {
        setBriefing({ result: data.result ?? null, cached: data.cached ?? false, loading: false, error: null });
      }
    } catch {
      setBriefing({ result: null, cached: false, loading: false, error: "Network error" });
    }
  }

  async function fetchInsights(opts: { force?: boolean } = {}) {
    setInsights((s) => ({ ...s, loading: true, error: null }));
    try {
      const url = opts.force ? "/api/ai/insights?force=1" : "/api/ai/insights";
      const res = await fetch(url, { method: "POST" });
      const data = (await res.json()) as { result?: string; cached?: boolean; error?: string };
      if (!res.ok) {
        setInsights({ result: null, cached: false, loading: false, error: data.error ?? "Failed" });
      } else {
        setInsights({ result: data.result ?? null, cached: data.cached ?? false, loading: false, error: null });
      }
    } catch {
      setInsights({ result: null, cached: false, loading: false, error: "Network error" });
    }
  }

  useEffect(() => {
    fetchBriefing();
    fetchInsights();
    const handler = () => {
      fetchBriefing({ force: true });
      fetchInsights({ force: true });
    };
    window.addEventListener(AI_REFRESH_EVENT, handler);
    return () => window.removeEventListener(AI_REFRESH_EVENT, handler);
     
  }, []);

  const tabs: Tab[] = ["BRIEFING", "INSIGHTS"];
  const current = tab === "BRIEFING" ? briefing : insights;

  return (
    <div className="border border-border bg-card">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border text-accent text-xs tracking-wide truncate">
        &#9654; AI ASSISTANT
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
          <div className="text-xs whitespace-pre-wrap break-words leading-relaxed text-foreground border border-border bg-background p-3 overflow-hidden">
            {sanitizeAiOutput(current.result)}
          </div>
        )}

        {!current.loading && current.cached && (
          <div className="pt-1">
            <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5">
              CACHED
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

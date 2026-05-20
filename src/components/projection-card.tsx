"use client";

// AI PROJECTION card — slim. Renders ONLY the future-looking content:
// scenario selector + per-year projection table + AI narrative.
// Current portfolio snapshot (Top Summary 4-stat), trigger status (RulebookStatus),
// and static 70/30 execution plan (ThisWeekActionPlan) are owned by other components.
import { useState, useEffect } from "react";
import { sanitizeAiOutput } from "@/lib/ai-output-rules";
import type { ProjectionApiResponse as ProjectionData } from "@/lib/types/ai-projection";
import { AI_REFRESH_EVENT } from "@/components/ai-page-refresh";

function fmtCAD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M CAD`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K CAD`;
  return `$${n.toLocaleString()} CAD`;
}
function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

export function ProjectionCard() {
  const [data, setData] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeScenario, setActiveScenario] = useState<"base" | "pessimistic" | "worst">("base");

  async function load(opts: { force?: boolean } = {}) {
    setLoading(true);
    setError(null);
    try {
      const url = opts.force ? "/api/ai/projection?force=1" : "/api/ai/projection";
      const res = await fetch(url, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed"); return; }
      setData(json);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const handler = () => load({ force: true });
    window.addEventListener(AI_REFRESH_EVENT, handler);
    return () => window.removeEventListener(AI_REFRESH_EVENT, handler);
     
  }, []);

  const a = data?.assumptions;
  const scenarios = data?.scenarios;
  // scenarios always holds V2 per-asset points; legacy projections is only used when scenarios is missing.
  const activeRows = scenarios
    ? (scenarios.find(s => s.id === activeScenario)?.points ?? [])
    : [];

  return (
    <div className="border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border gap-2">
        <div className="text-accent text-xs tracking-wide truncate">
          &#9654; PROJECTION
        </div>
        {data?.cached && (
          <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 shrink-0">CACHED</span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {loading && (
          <div className="text-xs text-muted-foreground text-center py-6">CALCULATING PROJECTIONS...</div>
        )}

        {error && !loading && (
          <div className="text-xs text-negative">{error}</div>
        )}

        {data && !loading && (
          <>

            {/* 1) Scenario selector + projection table. Scenario summary cards removed by user request — internal Base/Pess/Worst calculation 그대로 유지. */}
            {scenarios && scenarios.length > 0 && (
              <section className="space-y-2">
                <div className="flex gap-1 text-[10px] flex-wrap">
                  {scenarios.map(s => {
                    const shortLabel = s.label === "PESSIMISTIC" ? "PESS" : s.label;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setActiveScenario(s.id)}
                        className={`px-2 py-1 border whitespace-nowrap ${
                          activeScenario === s.id
                            ? "border-accent text-accent"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="md:hidden">{shortLabel} {s.cagrPct.toFixed(1)}%</span>
                        <span className="hidden md:inline">{s.label} {s.cagrPct.toFixed(1)}%</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                  <span>배당 성장률 <span className="text-foreground">{fmtPct(a?.divGrowthPct ?? 0)}</span></span>
                  <span>연 납입 <span className="text-foreground">{fmtCAD(a?.annualContribCAD ?? 0)}</span></span>
                  <span>현재 연배당 <span className="text-foreground">{fmtCAD(a?.currentAnnualDivCAD ?? 0)}</span></span>
                </div>

                {/* Projection table — desktop. Per-asset breakdown + trigger flags. */}
                <div className="hidden md:block overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-[11px] tabular-nums border border-border">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border bg-muted/30">
                        <th className="text-left  py-1.5 px-2 font-normal">연도</th>
                        <th className="text-right py-1.5 px-2 font-normal">총 평가</th>
                        <th className="text-right py-1.5 px-2 font-normal">SCHD</th>
                        <th className="text-right py-1.5 px-2 font-normal">QLD</th>
                        <th className="text-right py-1.5 px-2 font-normal">SGOV</th>
                        <th className="text-right py-1.5 px-2 font-normal">QQQI</th>
                        <th className="text-right py-1.5 px-2 font-normal">연배당</th>
                        <th className="text-right py-1.5 px-2 font-normal">월배당</th>
                        <th className="text-right py-1.5 px-2 font-normal">인출</th>
                        <th className="text-right py-1.5 px-2 font-normal">월 가용</th>
                        <th className="text-left  py-1.5 px-2 font-normal">이벤트</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeRows.map((p) => {
                        const isRetirement = a?.retirementYear === p.year;
                        // Event labels shown in the projection table per simulated year.
                        const events: string[] = [];
                        if (p.hardExitApplied) events.push("Emergency cap");
                        if (p.softExitApplied) events.push("Soft Exit");
                        if (p.crisisT2Applied) events.push("Crisis T2");
                        else if (p.crisisT1Applied) events.push("Crisis T1");
                        if (p.caseAApplied) events.push("Case A");
                        if (p.caseBApplied) events.push("Case B");
                        return (
                          <tr key={p.year} className={`border-b border-border/50 ${isRetirement ? "text-primary" : ""}`}>
                            <td className="text-left  py-1.5 px-2">
                              {p.year}
                              {isRetirement && (
                                <span className="ml-1.5 text-[9px] border border-primary/40 px-1 py-0.5 text-primary">은퇴</span>
                              )}
                            </td>
                            <td className="text-right py-1.5 px-2">{fmtCAD(p.totalCAD)}</td>
                            <td className="text-right py-1.5 px-2">{fmtCAD(p.schdCAD)}</td>
                            <td className="text-right py-1.5 px-2">{fmtCAD(p.qldCAD)}</td>
                            <td className="text-right py-1.5 px-2 text-muted-foreground">{fmtCAD(p.sgovCAD)}</td>
                            <td className="text-right py-1.5 px-2 text-muted-foreground">{fmtCAD(p.jepqCAD)}</td>
                            <td className="text-right py-1.5 px-2 text-positive">{fmtCAD(p.annualDivCAD)}</td>
                            <td className="text-right py-1.5 px-2 text-positive/80">{fmtCAD(p.monthlyDivCAD)}</td>
                            <td className="text-right py-1.5 px-2 text-amber-500">
                              {p.withdrawalCAD > 0 ? fmtCAD(p.withdrawalCAD) : "—"}
                            </td>
                            <td className="text-right py-1.5 px-2 text-primary">
                              {p.monthlyCashflowCAD > 0 ? fmtCAD(p.monthlyCashflowCAD) : "—"}
                            </td>
                            <td className="text-left  py-1.5 px-2 text-[10px] text-amber-500">{events.join(", ") || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Projection — mobile 2-up grid (좌우 두 연도가 한 행에 배치) */}
                <ul className="md:hidden grid grid-cols-2 gap-px bg-border border border-border">
                  {activeRows.map((p) => {
                    const isRetirement = a?.retirementYear === p.year;
                    // v4.4.2 event labels (short form for mobile).
                    const events: string[] = [];
                    if (p.hardExitApplied) events.push("Emerg");
                    if (p.softExitApplied) events.push("Soft");
                    if (p.crisisT2Applied) events.push("T2");
                    else if (p.crisisT1Applied) events.push("T1");
                    if (p.caseAApplied) events.push("Case A");
                    if (p.caseBApplied) events.push("Case B");
                    return (
                      <li key={p.year} className={`bg-card px-3 py-2 ${isRetirement ? "text-primary" : ""}`}>
                        <div className="flex items-baseline justify-between gap-1">
                          <span className="text-[11px] font-medium tabular-nums">
                            {p.year}
                            {isRetirement && (
                              <span className="ml-1 text-[9px] border border-primary/40 px-1 py-0.5">은퇴</span>
                            )}
                          </span>
                          <span className="text-[10px] tabular-nums truncate">{fmtCAD(p.totalCAD)}</span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground space-y-0.5">
                          <div className="flex items-baseline justify-between gap-1">
                            <span>SCHD</span>
                            <span className="tabular-nums truncate">{fmtCAD(p.schdCAD)}</span>
                          </div>
                          <div className="flex items-baseline justify-between gap-1">
                            <span>QLD</span>
                            <span className="tabular-nums truncate">{fmtCAD(p.qldCAD)}</span>
                          </div>
                          <div className="flex items-baseline justify-between gap-1">
                            <span>연배당</span>
                            <span className="text-positive tabular-nums truncate">{fmtCAD(p.annualDivCAD)}</span>
                          </div>
                          <div className="flex items-baseline justify-between gap-1">
                            <span>월배당</span>
                            <span className="text-positive/80 tabular-nums truncate">{fmtCAD(p.monthlyDivCAD)}</span>
                          </div>
                          {p.monthlyCashflowCAD > 0 && (
                            <div className="flex items-baseline justify-between gap-1">
                              <span>월 가용</span>
                              <span className="text-primary tabular-nums truncate">{fmtCAD(p.monthlyCashflowCAD)}</span>
                            </div>
                          )}
                          {events.length > 0 && (
                            <div className="text-[9px] text-amber-500">{events.join(" / ")}</div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* 2) AI narrative — future-only commentary */}
            {data.narrative && (
              <section className="space-y-2">
                <h3 className="text-[10px] tracking-wide text-muted-foreground">AI 분석</h3>
                <div className="text-xs leading-relaxed text-foreground border border-border bg-background p-3 whitespace-pre-wrap">
                  {sanitizeAiOutput(data.narrative)}
                </div>
              </section>
            )}

          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AI_REFRESH_EVENT } from "@/components/ai-page-refresh";

// Compact rebalancing/trigger snapshot. Renders ONLY a 4-stat dashboard so the
// AI page header gives an at-a-glance status read. All detailed numbers
// (Method B table, Non-Core CAD, QLD emergency plan, full trigger list, AI
// narrative) live in ProjectionCard below — this component intentionally
// avoids duplicating them.

// Task 9 compile-fix: flag renames only (qldEmergencyCap→hardExit, qldCrisisTier1/2→crisisT1/2,
// sgovNeedsRefill→sgovBelowTarget); Task 10 owns the 4-stat redesign and corrected copy.
interface CurrentState {
  portfolioValueCAD: number;
  coreCAD: number;
  schdCAD: number;
  qldCAD: number;
  sgovCAD: number;
  iaumCAD: number;
  qldCoreWeightPct: number;
  schdCoreWeightPct: number;
  sgovTotalWeightPct: number;
  iaumTotalWeightPct: number;
  flags: {
    hardExit: boolean;
    crisisT1: boolean;
    crisisT2: boolean;
    sgovBelowTarget: boolean;
    iaumAtCap: boolean;
  };
}

interface ProjectionApiResponse {
  currentState?: CurrentState;
}

function fmtDollar(n: number) {
  return `$${Math.round(n).toLocaleString()} CAD`;
}
function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

export function AiTriggerSummary() {
  const [data, setData] = useState<ProjectionApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (opts: { force?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    const url = opts.force ? "/api/ai/projection?force=1" : "/api/ai/projection";
    fetch(url, { method: "POST" })
      .then(async (r) => {
        const json = (await r.json()) as ProjectionApiResponse & { error?: string };
        if (!r.ok) throw new Error(json.error ?? "Failed");
        return json;
      })
      .then((json) => setData(json))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const handler = () => load({ force: true });
    window.addEventListener(AI_REFRESH_EVENT, handler);
    return () => window.removeEventListener(AI_REFRESH_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="border border-border bg-card p-4 text-xs text-muted-foreground">
        룰북 상태를 계산 중…
      </div>
    );
  }
  if (error || !data?.currentState) {
    return (
      <div className="border border-border bg-card p-4 text-xs text-muted-foreground space-y-2">
        <div>룰북 상태를 가져올 수 없습니다.</div>
        {error && <div className="text-[10px] text-negative">사유: {error}</div>}
        {!error && !data?.currentState && (
          <div className="text-[10px] text-amber-500">
            응답에 currentState가 없습니다. 페이지 상단의 새로고침 아이콘을 눌러 다시 시도하세요.
          </div>
        )}
      </div>
    );
  }

  const cs = data.currentState;

  // QLD core weight sub-text doubles as a single-line trigger summary so the
  // page header captures the most critical action without duplicating the full
  // trigger list (which lives in ProjectionCard below).
  const qldSub = cs.flags.hardExit
    ? "긴급 매도 (≥38% core, §10) — 아래 실행안 참고"
    : cs.flags.crisisT2
      ? "2단계 위기 (≤20% core)"
      : cs.flags.crisisT1
        ? "1단계 위기 (≤25% core)"
        : "목표 30% (core)";

  return (
    <div className="border border-border bg-card">
      <div className="px-4 py-2 border-b border-border text-accent text-xs tracking-wide truncate">
        ▶ REBALANCING / TRIGGER STATUS (RULEBOOK v4.1.8)
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
        <Stat label="총 평가금액"   value={fmtDollar(cs.portfolioValueCAD)} />
        <Stat label="코어 평가금액" value={fmtDollar(cs.coreCAD)} sub="SCHD + QLD" />
        <Stat
          label="QLD 코어 비중"
          value={fmtPct(cs.qldCoreWeightPct)}
          tone={cs.flags.hardExit ? "negative" : cs.flags.crisisT1 || cs.flags.crisisT2 ? "negative" : "default"}
          sub={qldSub}
        />
        <Stat
          label="SGOV 전체 비중"
          value={fmtPct(cs.sgovTotalWeightPct)}
          tone={cs.flags.sgovBelowTarget ? "amber" : "default"}
          sub={cs.flags.sgovBelowTarget ? "보충 필요 (<5% total)" : "목표 5% total"}
        />
      </div>
      <div className="px-4 pb-3 text-[10px] text-muted-foreground">
        실행안·시나리오·AI 분석은 아래 PROJECTION 카드 참고.
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "negative" | "amber";
}) {
  const valueClass =
    tone === "negative" ? "text-negative"
      : tone === "amber" ? "text-amber-500"
        : "text-foreground";
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

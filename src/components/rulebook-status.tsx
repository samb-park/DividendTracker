"use client";

// Structured rulebook trigger status. Each row shows ON/OFF (적용/미적용) + 짧은 사유.
// No long sentences, no buy amounts. Pure status indicators.
import { useEffect, useState } from "react";
import type { ProjectionApiResponse, CurrentState } from "@/lib/types/ai-projection";
import { AI_REFRESH_EVENT } from "@/components/ai-page-refresh";

type Status = "applied" | "inactive" | "pending" | "unverified";

function StatusPill({ status, label }: { status: Status; label: string }) {
  const cls =
    status === "applied"
      ? "text-negative border-negative/40"
      : status === "pending"
        ? "text-amber-500 border-amber-500/40"
        : status === "unverified"
          ? "text-muted-foreground border-muted-foreground/40"
          : "text-muted-foreground border-border";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 border ${cls}`}>{label}</span>
  );
}

function StatusRow({
  title,
  status,
  statusLabel,
  hint,
}: {
  title: string;
  status: Status;
  statusLabel: string;
  hint?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-[11px]">
      <div className="min-w-0">
        <div className="truncate">{title}</div>
        {hint && <div className="text-[10px] text-muted-foreground truncate">{hint}</div>}
      </div>
      <StatusPill status={status} label={statusLabel} />
    </li>
  );
}

export function RulebookStatus() {
  const [data, setData] = useState<ProjectionApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (opts: { force?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    const url = opts.force ? "/api/ai/projection?force=1" : "/api/ai/projection";
    fetch(url, { method: "POST" })
      .then(async (r) => {
        const json = (await r.json()) as ProjectionApiResponse;
        if (!r.ok) throw new Error(json.error ?? "Failed");
        return json;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const handler = () => load({ force: true });
    window.addEventListener(AI_REFRESH_EVENT, handler);
    return () => window.removeEventListener(AI_REFRESH_EVENT, handler);
     
  }, []);

  return (
    <div className="border border-border bg-card">
      <div className="px-4 py-2 border-b border-border text-accent text-xs tracking-wide">
        ▶ RULEBOOK STATUS
      </div>
      <div className="p-2">
        {loading && <div className="px-3 py-2 text-[11px] text-muted-foreground">로딩…</div>}
        {error && !loading && (
          <div className="px-3 py-2 text-[11px] text-negative">사유: {error}</div>
        )}
        {!loading && !error && data?.currentState && (
          <Body
            cs={data.currentState}
            crisisTriggerActive={data.crisisTriggerPlan?.active ? { tier: data.crisisTriggerPlan.tier } : null}
            annualRebalanceAction={data.annualRebalancePlan?.action ?? null}
          />
        )}
      </div>
    </div>
  );
}

function Body({
  cs,
  crisisTriggerActive,
  annualRebalanceAction,
}: {
  cs: CurrentState;
  crisisTriggerActive: { tier?: "T1" | "T2" } | null;
  annualRebalanceAction: "deadband" | "case_a" | "case_b" | "case_b_no_room" | null;
}) {
  const f = cs.flags;

  const crisisStatus: Status = f.crisisT2 ? "applied" : f.crisisT1 ? "applied" : "inactive";
  const crisisHint = f.crisisT2 ? "T2 (≤20% core) — 누적 5%" : f.crisisT1 ? "T1 (≤25% core) — 2.5%" : "정상 범위";

  // v4.5.0: SGOV target 5% / allowed range 0~8%. Crisis uses SGOV → QLD.
  const sgovBaseStatus: Status = f.sgovBelowTarget ? "pending" : "inactive";
  const sgovBaseLabel  = f.sgovBelowTarget ? "베이스 미달 (<5%)" : "정상 (≥5%)";
  const sgovAboveStatus: Status = f.sgovAboveMax ? "pending" : "inactive";
  const sgovAboveLabel  = f.sgovAboveMax ? "상한 초과 (>8%)" : "상한 내 (≤8%)";

  const today = new Date();
  const isYearEnd = today.getMonth() === 11 && today.getDate() >= 25;
  const annualStatus: Status =
    annualRebalanceAction === "deadband" || annualRebalanceAction === null
      ? (isYearEnd && (f.caseAEligible || f.caseBEligible) ? "pending" : "inactive")
      : "applied";
  const annualLabel = annualRebalanceAction === "case_a"
    ? "Case A — 초과분 → SGOV"
    : annualRebalanceAction === "case_b"
      ? "Case B — 무행동"
      : annualRebalanceAction === "case_b_no_room"
        ? "Case B 차단"
        : f.inDeadband
          ? "데드밴드 (29-31%, 무행동)"
          : isYearEnd ? "예정 (12/31)" : "해당 없음 (12/31 외)";

  void crisisTriggerActive;

  return (
    <ul className="divide-y divide-border border border-border">
      <StatusRow
        title="§6.1 Crisis Trigger (MONTH-END close 만)"
        status={crisisStatus}
        statusLabel={crisisStatus === "applied" ? "적용" : "미적용"}
        hint={`${crisisHint} · SGOV 0%까지 소진 가능 · 매수 자산은 QLD · reset=QLD core ≥30%`}
      />
      <StatusRow
        title="SGOV 베이스 (5%)"
        status={sgovBaseStatus}
        statusLabel={sgovBaseLabel}
        hint={`현재 ${cs.sgovTotalWeightPct}% · base 5% / max 8% / min 0% (바닥 없음)`}
      />
      <StatusRow
        title="SGOV 상한 (8%)"
        status={sgovAboveStatus}
        statusLabel={sgovAboveLabel}
        hint="8% 초과분/연말 trim proceeds는 SGOV로 정리"
      />
      <StatusRow
        title="연말 리밸런스"
        status={annualStatus}
        statusLabel={annualLabel}
        hint="v4.5.0 Core 목표 60/40 · overshoot trim proceeds → SGOV · SCHD 매도 금지"
      />
    </ul>
  );
}

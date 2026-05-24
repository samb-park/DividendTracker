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
            tqqqExitActive={data.tqqqExitPlan?.active ? { variant: data.tqqqExitPlan.variant } : null}
            crisisTriggerActive={data.crisisTriggerPlan?.active ? { tier: data.crisisTriggerPlan.tier } : null}
            annualRebalanceAction={data.annualRebalancePlan?.action ?? null}
            qqqmReason={data.qqqmWeeklyPlan?.reason}
            qqqmAnnualSkimPlan={data.qqqmAnnualSkimPlan ?? null}
            overlayActive={data.coreAllocationPlan?.overlayActive ?? false}
          />
        )}
      </div>
    </div>
  );
}

function Body({
  cs,
  tqqqExitActive,
  crisisTriggerActive,
  annualRebalanceAction,
  qqqmReason,
  qqqmAnnualSkimPlan,
  overlayActive,
}: {
  cs: CurrentState;
  tqqqExitActive: { variant?: "soft" | "hard" } | null;
  crisisTriggerActive: { tier?: "T1" | "T2" } | null;
  annualRebalanceAction: "deadband" | "case_a" | "case_b" | "case_b_no_room" | null;
  qqqmReason?: string;
  qqqmAnnualSkimPlan: NonNullable<ProjectionApiResponse["qqqmAnnualSkimPlan"]> | null;
  overlayActive: boolean;
}) {
  const f = cs.flags;

  const hardExitStatus: Status = f.hardExit ? "applied" : "inactive";
  const softExitStatus: Status = f.softExit ? "applied" : "inactive";
  const crisisStatus: Status = f.crisisT2 ? "applied" : f.crisisT1 ? "applied" : "inactive";
  const crisisHint = f.crisisT2 ? "T2 (≤20% core) — 누적 5%" : f.crisisT1 ? "T1 (≤25% core) — 2.5%" : "정상 범위";

  // v4.4.6.1: SGOV base 5% / max 8% / min 0%. No hard floor. Above-max row replaces the old floor row.
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
    ? "Case A — QLD 매도 → SCHD"
    : annualRebalanceAction === "case_b"
      ? "Case B — 무행동 (v4.4.2+)"
      : annualRebalanceAction === "case_b_no_room"
        ? "Case B 차단 (SGOV 바닥)"
        : f.inDeadband
          ? "데드밴드 (29-31%, 무행동)"
          : isYearEnd ? "예정 (12/31)" : "해당 없음 (12/31 외)";

  // QQQM (v4.4.6.1 — Sangbong TFSA only, no cap, weekly 45 CAD CAD-accum)
  let qqqmStatus: Status;
  let qqqmLabel: string;
  if (qqqmReason && qqqmReason.startsWith("적용")) {
    qqqmStatus = "pending"; qqqmLabel = "충족";
  } else if (qqqmReason && qqqmReason.startsWith("사용자 Settings 별도")) {
    qqqmStatus = "pending"; qqqmLabel = "충족 (사용자)";
  } else if (qqqmReason?.includes("TFSA 잔여한도 없음")) {
    qqqmStatus = "inactive"; qqqmLabel = "미충족 (TFSA room 없음)";
  } else if (qqqmReason?.startsWith("룰북 default")) {
    qqqmStatus = "pending"; qqqmLabel = "충족 (룰북)";
  } else if (!qqqmReason) {
    qqqmStatus = "unverified"; qqqmLabel = "확인 필요";
  } else {
    qqqmStatus = "inactive"; qqqmLabel = "미충족";
  }

  // §4 QQQM 연 skim (12/31) row
  let qqqmSkimStatus: Status = "unverified";
  let qqqmSkimLabel = "확인 필요";
  let qqqmSkimHint = "조건 = V_usd > cumulativeCostUsd AND V_usd > 0; 12/31 (또는 직전 거래일)";
  if (qqqmAnnualSkimPlan) {
    const daysUntil = qqqmAnnualSkimPlan.daysUntilSkim;
    if (qqqmAnnualSkimPlan.eligibilityHint === "profitable") {
      qqqmSkimStatus = "pending";
      qqqmSkimLabel = `예정 (≈ $${qqqmAnnualSkimPlan.estimatedSkimAmountUsd.toLocaleString()} USD, D-${daysUntil})`;
    } else if (qqqmAnnualSkimPlan.eligibilityHint === "no-position") {
      qqqmSkimStatus = "inactive";
      qqqmSkimLabel = `해당 없음 (QQQM 보유 0)`;
    } else {
      qqqmSkimStatus = "inactive";
      qqqmSkimLabel = `미해당 (USD 손실, D-${daysUntil})`;
    }
    qqqmSkimHint = `다음 일자 ${qqqmAnnualSkimPlan.nextSkimDateISO}${qqqmAnnualSkimPlan.isPostponed ? " (주말 조정)" : ""} · cumulativeCostUsd 차감 금지`;
  }

  void tqqqExitActive;
  void crisisTriggerActive;

  return (
    <ul className="divide-y divide-border border border-border">
      <StatusRow
        title="§10 Emergency cap (성장 버킷 ≥ 38%, daily close)"
        status={hardExitStatus}
        statusLabel={hardExitStatus === "applied" ? "적용" : "미적용"}
        hint="TQQQ 전량 + QLD 30% → SGOV 8% (max) → SCHD · QQQM 매도 금지"
      />
      <StatusRow
        title="§6.2 TQQQ Soft Exit (성장 버킷 ≥ 34%, daily close)"
        status={softExitStatus}
        statusLabel={softExitStatus === "applied" ? "적용" : "미적용"}
        hint="TQQQ 절반 매도 → SGOV 8% (max) → SCHD"
      />
      <StatusRow
        title="§6.1 Crisis Trigger (MONTH-END close 만)"
        status={crisisStatus}
        statusLabel={crisisStatus === "applied" ? "적용" : "미적용"}
        hint={`${crisisHint} · SGOV 0%까지 소진 가능 (바닥 없음) · QQQM 매도 금지`}
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
        hint="annual rebal / QQQM 12/31 skim refill은 상한에서 중단"
      />
      <StatusRow
        title="TQQQ 오버레이"
        status={overlayActive ? "applied" : "inactive"}
        statusLabel={overlayActive ? "활성 (SCHD 70 / TQQQ 30 / QLD 0)" : "비활성 (SCHD 70 / QLD 30)"}
        hint="TQQQ > 0 시 Core 분배가 오버레이로 전환 · SCHD 배당도 동일 분배"
      />
      <StatusRow
        title="QQQM 주간 CAD 누적 (Sangbong TFSA)"
        status={qqqmStatus}
        statusLabel={qqqmLabel}
        hint="조건 = TFSA room · 주간 45 CAD CAD-accum · cap 없음 · 분기 NG batch 사용자 외부 처리"
      />
      <StatusRow
        title="§4 QQQM 연 skim (12/31)"
        status={qqqmSkimStatus}
        statusLabel={qqqmSkimLabel}
        hint={qqqmSkimHint}
      />
      <StatusRow
        title="연말 리밸런스"
        status={annualStatus}
        statusLabel={annualLabel}
        hint="29 ≤ W ≤ 31% 무행동 / W > 31% Case A (refill SGOV→8% max) / W < 29% 무행동 (SCHD 매도 금지)"
      />
    </ul>
  );
}

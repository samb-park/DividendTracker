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
            jepqReason={data.jepqWeeklyPlan?.reason}
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
  jepqReason,
  overlayActive,
}: {
  cs: CurrentState;
  tqqqExitActive: { variant?: "soft" | "hard" } | null;
  crisisTriggerActive: { tier?: "T1" | "T2" } | null;
  annualRebalanceAction: "deadband" | "case_a" | "case_b" | "case_b_no_room" | null;
  jepqReason?: string;
  overlayActive: boolean;
}) {
  const f = cs.flags;

  const hardExitStatus: Status = f.hardExit ? "applied" : "inactive";
  const softExitStatus: Status = f.softExit ? "applied" : "inactive";
  const crisisStatus: Status = f.crisisT2 ? "applied" : f.crisisT1 ? "applied" : "inactive";
  const crisisHint = f.crisisT2 ? "T2 (≤20% core) — 누적 5%" : f.crisisT1 ? "T1 (≤25% core) — 2.5%" : "정상 범위";

  const sgovTargetStatus: Status = f.sgovBelowTarget ? "pending" : "inactive";
  const sgovTargetLabel  = f.sgovBelowTarget ? "필요 (<8% target)" : "불필요 (≥8%)";
  const sgovFloorStatus: Status = f.sgovBelowFloor ? "applied" : "inactive";
  const sgovFloorLabel   = f.sgovBelowFloor ? "위기 바닥 침범" : "안전";

  const today = new Date();
  const isYearEnd = today.getMonth() === 11 && today.getDate() >= 25;
  const annualStatus: Status =
    annualRebalanceAction === "deadband" || annualRebalanceAction === null
      ? (isYearEnd && (f.caseAEligible || f.caseBEligible) ? "pending" : "inactive")
      : "applied";
  const annualLabel = annualRebalanceAction === "case_a"
    ? "Case A — QLD 매도 → SCHD"
    : annualRebalanceAction === "case_b"
      ? "Case B — SGOV → QLD"
      : annualRebalanceAction === "case_b_no_room"
        ? "Case B 차단 (SGOV 바닥)"
        : f.inDeadband
          ? "데드밴드 (29-31%, 무행동)"
          : isYearEnd ? "예정 (12/31)" : "해당 없음 (12/31 외)";

  // QQQI (v4.4.2 — Sangbong TFSA only, hard cap 5%)
  let jepqStatus: Status;
  let jepqLabel: string;
  if (jepqReason && jepqReason.startsWith("적용")) {
    jepqStatus = "pending"; jepqLabel = "충족";
  } else if (jepqReason && jepqReason.startsWith("사용자 Settings 별도")) {
    jepqStatus = "pending"; jepqLabel = "충족 (사용자)";
  } else if (jepqReason?.includes("TFSA 잔여한도 없음")) {
    jepqStatus = "inactive"; jepqLabel = "미충족 (TFSA room 없음)";
  } else if (jepqReason?.includes("QQQI 전체 비중")) {
    jepqStatus = "inactive"; jepqLabel = "미충족 (QQQI ≥ 5%)";
  } else if (f.jepqAtCap) {
    jepqStatus = "inactive"; jepqLabel = "미충족 (hard cap 도달)";
  } else if (!jepqReason) {
    jepqStatus = "unverified"; jepqLabel = "확인 필요";
  } else {
    jepqStatus = "inactive"; jepqLabel = "미충족";
  }

  void tqqqExitActive;
  void crisisTriggerActive;

  return (
    <ul className="divide-y divide-border border border-border">
      <StatusRow
        title="§10 Emergency cap (성장 버킷 ≥ 38%, daily close)"
        status={hardExitStatus}
        statusLabel={hardExitStatus === "applied" ? "적용" : "미적용"}
        hint="TQQQ 전량 + QLD 30% → SGOV 8% → SCHD"
      />
      <StatusRow
        title="§6.2 TQQQ Soft Exit (성장 버킷 ≥ 34%, daily close)"
        status={softExitStatus}
        statusLabel={softExitStatus === "applied" ? "적용" : "미적용"}
        hint="TQQQ 절반 매도 → SGOV 8% → SCHD"
      />
      <StatusRow
        title="§6.1 Crisis Trigger (MONTH-END close 만)"
        status={crisisStatus}
        statusLabel={crisisStatus === "applied" ? "적용" : "미적용"}
        hint={`${crisisHint} · SGOV 5% 바닥 보호`}
      />
      <StatusRow
        title="SGOV 보충 (target 8%)"
        status={sgovTargetStatus}
        statusLabel={sgovTargetLabel}
        hint={`현재 ${cs.sgovTotalWeightPct}% · floor 5% · 가용 버퍼 3%`}
      />
      <StatusRow
        title="SGOV 위기 바닥 (5%)"
        status={sgovFloorStatus}
        statusLabel={sgovFloorLabel}
        hint="위기 트리거만 침범 허용 · 가용 버퍼 = max(0, SGOV − 5%·Total)"
      />
      <StatusRow
        title="TQQQ 오버레이"
        status={overlayActive ? "applied" : "inactive"}
        statusLabel={overlayActive ? "활성 (SCHD 70 / TQQQ 30 / QLD 0)" : "비활성 (SCHD 70 / QLD 30)"}
        hint="TQQQ > 0 시 Core 분배가 오버레이로 전환 · SCHD 배당도 동일 분배"
      />
      <StatusRow
        title="QQQI Buy Condition (Sangbong TFSA)"
        status={jepqStatus}
        statusLabel={jepqLabel}
        hint="조건 = TFSA room AND QQQI < 5% (hard cap)"
      />
      <StatusRow
        title="연말 리밸런스"
        status={annualStatus}
        statusLabel={annualLabel}
        hint="29 ≤ W ≤ 31% 무행동 / W > 31% Case A (refill SGOV→8%) / W < 29% 무행동 (SCHD 매도 금지)"
      />
    </ul>
  );
}

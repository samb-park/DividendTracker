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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="border border-border bg-card">
      <div className="px-4 py-2 border-b border-border text-accent text-xs tracking-wide">
        ▶ RULEBOOK STATUS (트리거 적용 여부)
      </div>
      <div className="p-2">
        {loading && <div className="px-3 py-2 text-[11px] text-muted-foreground">로딩…</div>}
        {error && !loading && (
          <div className="px-3 py-2 text-[11px] text-negative">사유: {error}</div>
        )}
        {!loading && !error && data?.currentState && (
          // Task 9 compile-fix: qldEmergencyPlan → tqqqExitPlan rename only; row/label redesign is Task 10.
          <Body cs={data.currentState} qldEmergency={!!data.tqqqExitPlan?.active} iaumReason={data.iaumWeeklyPlan?.reason} />
        )}
      </div>
    </div>
  );
}

function Body({
  cs,
  qldEmergency,
  iaumReason,
}: {
  cs: CurrentState;
  qldEmergency: boolean;
  iaumReason?: string;
}) {
  const f = cs.flags;

  // Annual rebalance: rulebook §9 — Dec 31 only when QLD core > 30%.
  const today = new Date();
  const isYearEnd = today.getMonth() === 11 && today.getDate() >= 25; // late December window
  const annualEligible = cs.qldCoreWeightPct > 30;
  const annualStatus: Status = isYearEnd && annualEligible
    ? "pending"
    : "inactive";
  const annualLabel = isYearEnd && annualEligible
    ? "예정 (12/31, QLD core > 30%)"
    : annualEligible
      ? "해당 없음 (12/31 외)"
      : "해당 없음";

  // Task 9 compile-fix: legacy flag renames only — qldEmergencyCap→hardExit, qldCrisisTier1/2→crisisT1/2,
  // sgovNeedsRefill→sgovBelowTarget. Hint text/labels (e.g. "<5% total") are stale under v4.1.10
  // (sgovBelowTarget is < 8% now); Task 10 owns the copy + 7-row redesign.
  const emergencyStatus: Status = f.hardExit || qldEmergency ? "applied" : "inactive";
  const crisisStatus: Status =
    f.crisisT2 ? "applied"
      : f.crisisT1 ? "applied"
        : "inactive";
  const crisisHint = f.crisisT2 ? "2단계 (≤20% core)" : f.crisisT1 ? "1단계 (≤25% core)" : "정상 범위";

  const sgovRefillStatus: Status = f.hardExit
    ? "inactive"
    : f.sgovBelowTarget ? "pending" : "inactive";
  const sgovRefillLabel = f.hardExit
    ? "비활성 (긴급 매도 진행)"
    : f.sgovBelowTarget ? "필요 (<5% total)" : "불필요 (≥5% total)";

  // IAUM buy condition: needs both TFSA room and IAUM<5%. Server reason already
  // tells us why. We classify based on the reason text.
  let iaumStatus: Status;
  let iaumLabel: string;
  if (iaumReason && iaumReason.startsWith("적용")) {
    iaumStatus = "pending";
    iaumLabel = "충족";
  } else if (iaumReason && iaumReason.startsWith("사용자 Settings 별도")) {
    iaumStatus = "pending";
    iaumLabel = "충족 (사용자)";
  } else if (iaumReason?.includes("TFSA 잔여한도 없음")) {
    iaumStatus = "inactive";
    iaumLabel = "미충족 (TFSA room 없음)";
  } else if (iaumReason?.includes("IAUM 전체 비중")) {
    iaumStatus = "inactive";
    iaumLabel = "미충족 (IAUM ≥ 5%)";
  } else if (f.iaumAtCap) {
    iaumStatus = "inactive";
    iaumLabel = "미충족 (상한 도달)";
  } else if (!iaumReason) {
    iaumStatus = "unverified";
    iaumLabel = "확인 필요";
  } else {
    iaumStatus = "inactive";
    iaumLabel = "미충족";
  }

  return (
    <ul className="divide-y divide-border border border-border">
      <StatusRow
        title="QLD Emergency Cap (§10)"
        status={emergencyStatus}
        statusLabel={emergencyStatus === "applied" ? "적용" : "미적용"}
        hint={emergencyStatus === "applied" ? "다음 거래일 매도 → SGOV 5%까지 → SCHD" : "core < 38%"}
      />
      <StatusRow
        title="QLD Crisis Trigger (§10)"
        status={crisisStatus}
        statusLabel={crisisStatus === "applied" ? "적용" : "미적용"}
        hint={crisisHint}
      />
      <StatusRow
        title="SGOV Refill (§6)"
        status={sgovRefillStatus}
        statusLabel={sgovRefillLabel}
        hint="기준 = total portfolio 5%"
      />
      <StatusRow
        title="IAUM Buy Condition (§7)"
        status={iaumStatus}
        statusLabel={iaumLabel}
        hint="조건 = TFSA room 존재 AND IAUM < 5% total"
      />
      <StatusRow
        title="Annual Rebalance (§9)"
        status={annualStatus}
        statusLabel={annualLabel}
        hint="12월 31일에만, QLD core > 30%일 때"
      />
    </ul>
  );
}

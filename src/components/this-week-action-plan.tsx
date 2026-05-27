"use client";

// SOLE authoritative renderer for "이번 주 실행안" action plan.
// v4.5.0: Static 60/40 Core (SCHD/QLD) + SGOV user stream + QQQM hold-only/no-new-buy display.
// No other component on the AI page should display per-asset weekly buy CAD amounts.
import { useEffect, useState } from "react";
import type {
  CoreAllocationPlan,
  ProjectionApiResponse,
  QqqmWeeklyPlan,
} from "@/lib/types/ai-projection";
import { nonCoreSourceLabel } from "@/lib/types/ai-projection";
import { AI_REFRESH_EVENT } from "@/components/ai-page-refresh";

function fmtDollar(n: number) {
  return `$${Math.round(n).toLocaleString()} CAD`;
}

export function ThisWeekActionPlan() {
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
      .then((json) => setData(json))
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
      <div className="px-4 py-2 border-b border-border text-accent text-xs tracking-wide truncate">
        ▶ THIS WEEK ACTION PLAN
      </div>

      <div className="p-4">
        {loading && <div className="text-xs text-muted-foreground">계산 중…</div>}
        {error && !loading && (
          <div className="text-xs text-negative space-y-1">
            <div>실행안을 계산할 수 없습니다.</div>
            <div className="text-[10px]">사유: {error}</div>
          </div>
        )}
        {!loading && !error && data?.coreAllocationPlan && (
          <ActionPlanBody plan={data.coreAllocationPlan} qqqmPlan={data.qqqmWeeklyPlan} />
        )}
        {!loading && !error && !data?.coreAllocationPlan && (
          <div className="text-xs text-muted-foreground">실행안 데이터가 없습니다.</div>
        )}
      </div>
    </div>
  );
}

function ActionPlanBody({ plan, qqqmPlan }: { plan: CoreAllocationPlan; qqqmPlan?: QqqmWeeklyPlan }) {
  const nonCoreSum = plan.sgovReserveCAD + plan.qqqmCashAccumCAD;
  const totalOut = plan.totalWeeklyOutCAD ?? plan.weeklyContribCAD + nonCoreSum;
  void qqqmPlan;
  const coreTitle = "Core (정적 60/40)";
  const growthLabel = "QLD";
  const growthBuyCAD = plan.qldBuyCAD;

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full text-[11px] tabular-nums border border-border">
          <thead>
            <tr className="text-muted-foreground border-b border-border bg-muted/30">
              <th className="text-left py-1.5 px-2 font-normal">분류</th>
              <th className="text-left py-1.5 px-2 font-normal">자산</th>
              <th className="text-right py-1.5 px-2 font-normal">이번 주 매수</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="text-left py-1.5 px-2 text-muted-foreground" rowSpan={2}>{coreTitle}</td>
              <td className="text-left py-1.5 px-2">SCHD (60%)</td>
              <td className="text-right py-1.5 px-2">{fmtDollar(plan.schdBuyCAD)}</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="text-left py-1.5 px-2">
                {growthLabel} (40%)
              </td>
              <td className="text-right py-1.5 px-2">{fmtDollar(growthBuyCAD)}</td>
            </tr>
            <tr className="border-b border-border/50 bg-muted/10">
              <td className="text-left py-1.5 px-2 text-muted-foreground" rowSpan={2}>Non-Core (별도 스트림)</td>
              <td className="text-left py-1.5 px-2">
                SGOV
                {plan.sgovSource && (
                  <span className="ml-1 text-[9px] text-muted-foreground">({nonCoreSourceLabel(plan.sgovSource)})</span>
                )}
              </td>
              <td className="text-right py-1.5 px-2">{fmtDollar(plan.sgovReserveCAD)}</td>
            </tr>
            <tr className="border-b border-border/50 bg-muted/10">
              <td className="text-left py-1.5 px-2">
                QQQM
                {plan.qqqmSource && (
                  <span className="ml-1 text-[9px] text-muted-foreground">({nonCoreSourceLabel(plan.qqqmSource)})</span>
                )}
              </td>
              <td className="text-right py-1.5 px-2">{fmtDollar(plan.qqqmCashAccumCAD)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/20">
              <td className="text-left py-1.5 px-2 text-muted-foreground" colSpan={2}>주간 납입금 (Core)</td>
              <td className="text-right py-1.5 px-2">{fmtDollar(plan.weeklyContribCAD)}</td>
            </tr>
            <tr className="border-t border-border bg-muted/20">
              <td className="text-left py-1.5 px-2 text-muted-foreground" colSpan={2}>Satellite 추가 (SGOV)</td>
              <td className="text-right py-1.5 px-2">{fmtDollar(nonCoreSum)}</td>
            </tr>
            <tr className="border-t border-border bg-muted/30">
              <td className="text-left py-1.5 px-2 font-medium" colSpan={2}>주간 총 외화 유출</td>
              <td className="text-right py-1.5 px-2 font-medium">{fmtDollar(totalOut)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile compact list */}
      <div className="md:hidden border border-border divide-y divide-border">
        <div className="bg-muted/30 px-3 py-1.5 text-[10px] tracking-wide text-muted-foreground">
          {coreTitle}
        </div>
        <ul className="divide-y divide-border">
          <MobileRow label="SCHD (60%)" value={fmtDollar(plan.schdBuyCAD)} />
          <MobileRow
            label={`${growthLabel} (40%)`}
            value={fmtDollar(growthBuyCAD)}
          />
        </ul>
        <div className="bg-muted/10 px-3 py-1.5 text-[10px] tracking-wide text-muted-foreground">
          Non-Core (별도 스트림)
        </div>
        <ul className="divide-y divide-border">
          <MobileRow label="SGOV" value={fmtDollar(plan.sgovReserveCAD)} hint={plan.sgovSource ? nonCoreSourceLabel(plan.sgovSource) : undefined} />
          <MobileRow label="QQQM" value={fmtDollar(plan.qqqmCashAccumCAD)} hint={plan.qqqmSource ? nonCoreSourceLabel(plan.qqqmSource) : undefined} />
        </ul>
        <div className="bg-muted/20">
          <ul className="divide-y divide-border">
            <MobileRow label="주간 납입금 (Core)" value={fmtDollar(plan.weeklyContribCAD)} muted />
            <MobileRow label="Non-Core 추가" value={fmtDollar(nonCoreSum)} muted />
          </ul>
        </div>
        <div className="bg-muted/30">
          <ul>
            <MobileRow label="주간 총 외화 유출" value={fmtDollar(totalOut)} emphasis />
          </ul>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground mt-2">
        v4.5.0 정적 분배: Core 주간 455 CAD = SCHD 273 / QLD 182 (60/40). TQQQ 오버레이 없음. SCHD 배당 재투자도 SCHD 60 / QLD 40. SGOV는 Settings 별도 CAD 스트림이며, QQQM/QQQI/JEPQ/IAUM 신규 매수는 금지(기존 보유분 hold-only).
      </div>
    </>
  );
}

function MobileRow({
  label,
  value,
  emphasis,
  muted,
  hint,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
  hint?: string;
}) {
  return (
    <li className={`flex items-center justify-between gap-3 px-3 py-1.5 text-[11px] ${emphasis ? "font-medium" : ""}`}>
      <div className={`min-w-0 truncate ${muted ? "text-muted-foreground" : ""}`}>
        {label}
        {hint && <span className="ml-1 text-[9px] text-muted-foreground">({hint})</span>}
      </div>
      <div className={`text-right tabular-nums shrink-0 ${muted ? "text-muted-foreground" : ""}`}>{value}</div>
    </li>
  );
}

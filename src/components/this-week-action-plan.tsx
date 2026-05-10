"use client";

// SOLE authoritative renderer for "이번 주 실행안" action plan.
// Method B (Core SCHD/QLD) + Non-Core stream (SGOV/IAUM Settings CAD) + grand total.
// No other component on the AI page should display per-asset weekly buy CAD amounts.
import { useEffect, useState } from "react";
import type {
  MethodBPlan,
  ProjectionApiResponse,
  IaumWeeklyPlan,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="border border-border bg-card">
      <div className="px-4 py-2 border-b border-border text-accent text-xs tracking-wide truncate">
        ▶ THIS WEEK ACTION PLAN (실행안 — sole authority)
      </div>

      <div className="p-4">
        {loading && <div className="text-xs text-muted-foreground">계산 중…</div>}
        {error && !loading && (
          <div className="text-xs text-negative space-y-1">
            <div>실행안을 계산할 수 없습니다.</div>
            <div className="text-[10px]">사유: {error}</div>
          </div>
        )}
        {!loading && !error && data?.methodBPlan && (
          <ActionPlanBody mb={data.methodBPlan} iaumPlan={data.iaumWeeklyPlan} />
        )}
        {!loading && !error && !data?.methodBPlan && (
          <div className="text-xs text-muted-foreground">실행안 데이터가 없습니다.</div>
        )}
      </div>
    </div>
  );
}

function ActionPlanBody({ mb, iaumPlan }: { mb: MethodBPlan; iaumPlan?: IaumWeeklyPlan }) {
  const nonCoreSum = mb.sgovReserveCAD + mb.iaumBuyCAD;
  const totalOut = mb.totalWeeklyOutCAD ?? mb.weeklyContribCAD + nonCoreSum;

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
              <td className="text-left py-1.5 px-2 text-muted-foreground" rowSpan={3}>Core (Method B)</td>
              <td className="text-left py-1.5 px-2">SCHD</td>
              <td className="text-right py-1.5 px-2">{fmtDollar(mb.schdBuyCAD)}</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="text-left py-1.5 px-2">QLD</td>
              <td className="text-right py-1.5 px-2">{fmtDollar(mb.qldBuyCAD)}</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="text-left py-1.5 px-2 text-muted-foreground">미할당</td>
              <td className="text-right py-1.5 px-2 text-muted-foreground">{fmtDollar(mb.unallocatedCAD)}</td>
            </tr>
            <tr className="border-b border-border/50 bg-muted/10">
              <td className="text-left py-1.5 px-2 text-muted-foreground" rowSpan={2}>Non-Core (별도 스트림)</td>
              <td className="text-left py-1.5 px-2">
                SGOV
                {mb.sgovSource && (
                  <span className="ml-1 text-[9px] text-muted-foreground">({nonCoreSourceLabel(mb.sgovSource)})</span>
                )}
              </td>
              <td className="text-right py-1.5 px-2">{fmtDollar(mb.sgovReserveCAD)}</td>
            </tr>
            <tr className="border-b border-border/50 bg-muted/10">
              <td className="text-left py-1.5 px-2">
                IAUM
                {mb.iaumSource && (
                  <span className="ml-1 text-[9px] text-muted-foreground">({nonCoreSourceLabel(mb.iaumSource)})</span>
                )}
              </td>
              <td className="text-right py-1.5 px-2">{fmtDollar(mb.iaumBuyCAD)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/20">
              <td className="text-left py-1.5 px-2 text-muted-foreground" colSpan={2}>주간 납입금 (Core)</td>
              <td className="text-right py-1.5 px-2">{fmtDollar(mb.weeklyContribCAD)}</td>
            </tr>
            <tr className="border-t border-border bg-muted/20">
              <td className="text-left py-1.5 px-2 text-muted-foreground" colSpan={2}>Non-Core 추가 (SGOV+IAUM)</td>
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
          Core (Method B)
        </div>
        <ul className="divide-y divide-border">
          <MobileRow label="SCHD" value={fmtDollar(mb.schdBuyCAD)} />
          <MobileRow label="QLD" value={fmtDollar(mb.qldBuyCAD)} />
          <MobileRow label="미할당" value={fmtDollar(mb.unallocatedCAD)} muted />
        </ul>
        <div className="bg-muted/10 px-3 py-1.5 text-[10px] tracking-wide text-muted-foreground">
          Non-Core (별도 스트림)
        </div>
        <ul className="divide-y divide-border">
          <MobileRow label="SGOV" value={fmtDollar(mb.sgovReserveCAD)} hint={mb.sgovSource ? nonCoreSourceLabel(mb.sgovSource) : undefined} />
          <MobileRow label="IAUM" value={fmtDollar(mb.iaumBuyCAD)} hint={mb.iaumSource ? nonCoreSourceLabel(mb.iaumSource) : undefined} />
        </ul>
        <div className="bg-muted/20">
          <ul className="divide-y divide-border">
            <MobileRow label="주간 납입금 (Core)" value={fmtDollar(mb.weeklyContribCAD)} muted />
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
        Method B 비율(SCHD 70 / QLD 30)은 SCHD+QLD만 사용. SGOV/IAUM은 Settings 별도 CAD 스트림이며 Core Method B에 합산되지 않음. TQQQ 매수는 §6.1 위기 트리거 발동 시에만 SGOV→TQQQ 경로로 별도 실행 (Method B 무관).
        {iaumPlan?.reason && <> · IAUM: {iaumPlan.reason}</>}
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

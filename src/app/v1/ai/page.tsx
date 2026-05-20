import { AiPanel } from "@/components/ai-panel";
import { ProjectionCard } from "@/components/projection-card";
import { ProjectionVsActual } from "@/components/projection-vs-actual";
import { AiTriggerSummary } from "@/components/ai-trigger-summary";
import { ThisWeekActionPlan } from "@/components/this-week-action-plan";
import { RulebookStatus } from "@/components/rulebook-status";
import { AiPageRefreshButton } from "@/components/ai-page-refresh";
import { ErrorBoundary } from "@/components/error-boundary";

export const dynamic = "force-dynamic";

export default async function AiAssistantPage() {
  // 정보 구조 (룰북 v4.4.2):
  //   1. Top Summary       — 4-stat 스냅샷 (코어/QLD/SGOV)
  //   2. This Week Action  — 정적 70/30 + Non-Core (sole authority)
  //   3. Rulebook Status   — 트리거 적용 여부 (구조화 list)
  //   4. AI Briefing/Insights — 짧은 status / 분석 (액션 금액 반복 금지)
  //   5. Projection        — 미래 시나리오 + AI narrative (현재 상태/실행안 반복 금지)
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs tracking-wide text-muted-foreground">
          포트폴리오를 룰북 v4.4.2 기준으로 분석하고 이번 주 실행안을 제시합니다.
        </div>
        <AiPageRefreshButton />
      </div>

      {/* 1) Top Summary — 4-stat 스냅샷 */}
      <ErrorBoundary label="TOP SUMMARY">
        <AiTriggerSummary />
      </ErrorBoundary>

      {/* 2) This Week Action Plan — sole authoritative source for buy amounts */}
      <ErrorBoundary label="THIS WEEK ACTION PLAN">
        <ThisWeekActionPlan />
      </ErrorBoundary>

      {/* 3) Rulebook Status — 구조화된 트리거 적용 여부 */}
      <ErrorBoundary label="RULEBOOK STATUS">
        <RulebookStatus />
      </ErrorBoundary>

      {/* 4) Briefing + Insights tabs — text only, no buy amounts */}
      <ErrorBoundary label="AI ASSISTANT">
        <AiPanel />
      </ErrorBoundary>

      {/* 5) Projection — 장기 시나리오 + 미래 narrative */}
      <ErrorBoundary label="AI PROJECTION">
        <ProjectionCard />
      </ErrorBoundary>

      {/* 6) Projection vs Actual — historical snapshot tracking against rulebook scenarios */}
      <ErrorBoundary label="PROJECTION VS ACTUAL">
        <ProjectionVsActual />
      </ErrorBoundary>
    </div>
  );
}

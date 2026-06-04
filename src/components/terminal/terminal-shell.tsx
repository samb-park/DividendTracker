"use client";

import { useState } from "react";
import { TopBar, type TabKey } from "./top-bar";
import { IndexStrip } from "./index-strip";
import { Panel } from "./panel";
import { PanelEmpty } from "./panel-state";
import { WatchGridPanel } from "./panels/watch-grid-panel";
import { CandleChartPanel } from "./panels/candle-chart-panel";
import { FundamentalsPanel } from "./panels/fundamentals-panel";
import { MarketOverviewPanel } from "./panels/market-overview-panel";

function CenterContent({ tab, ticker }: { tab: TabKey; ticker: string }) {
  switch (tab) {
    case "차트":
      return <CandleChartPanel ticker={ticker} />;
    case "시장":
      return <MarketOverviewPanel />;
    case "옵션":
      return (
        <PanelEmpty
          kind="api_required"
          message="실시간 옵션 체인 데이터 소스 연동이 필요합니다. (다음 슬라이스) 가짜 호가는 표시하지 않습니다."
        />
      );
    case "주문":
      return (
        <PanelEmpty
          kind="api_required"
          message="브로커 주문/체결 연동이 필요합니다. Alpaca / IBKR / 한국투자증권 어댑터는 다음 슬라이스에서 추가됩니다."
        />
      );
    case "뉴스":
      return (
        <PanelEmpty
          kind="api_required"
          message="뉴스 원문 + 한국어 번역 패널은 /api/ai/news 연동으로 다음 슬라이스에서 추가됩니다."
        />
      );
    case "포트":
      return (
        <PanelEmpty
          kind="no_data"
          message="포트폴리오 패널은 기존 포트폴리오 엔진을 재사용하여 다음 슬라이스에서 연결됩니다."
        />
      );
    case "모니터":
      return <PanelEmpty kind="no_data" message="멀티 모니터(다중 종목) 화면은 준비 중입니다." />;
    case "AI":
      return (
        <PanelEmpty
          kind="api_required"
          message="AI 어시스턴트(hermes 게이트웨이)는 다음 슬라이스에서 연결됩니다. 키가 없으면 로컬 규칙 기반 요약으로 동작합니다."
        />
      );
    default:
      return <PanelEmpty kind="no_data" />;
  }
}

export function TerminalShell() {
  const [tab, setTab] = useState<TabKey>("차트");
  const [ticker, setTicker] = useState("AAPL");

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background lg:h-[100dvh] lg:overflow-hidden">
      <TopBar activeTab={tab} onTabChange={setTab} onCommand={setTicker} />
      <IndexStrip />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-1 overflow-y-auto p-1 lg:grid-cols-[210px_minmax(0,1fr)_290px] lg:overflow-hidden">
        {/* LEFT */}
        <div className="flex min-h-0 flex-col gap-1 lg:overflow-hidden">
          <Panel
            title="관심종목 / WATCH"
            className="min-h-[240px] flex-1 lg:min-h-0"
            noPadding
          >
            <WatchGridPanel selected={ticker} onSelect={setTicker} />
          </Panel>
        </div>

        {/* CENTER */}
        <div className="flex min-h-0 flex-col gap-1 lg:overflow-hidden">
          <Panel
            title={`${tab}${tab === "차트" ? ` · ${ticker}` : ""}`}
            className="min-h-[400px] flex-1 lg:min-h-0"
            noPadding
          >
            <CenterContent tab={tab} ticker={ticker} />
          </Panel>
        </div>

        {/* RIGHT */}
        <div className="flex min-h-0 flex-col gap-1 lg:overflow-hidden">
          <Panel title="펀더멘털 / FUNDAMENTALS" className="min-h-[220px] flex-shrink-0">
            <FundamentalsPanel ticker={ticker} />
          </Panel>
          <Panel title="호가 / LEVEL II" className="min-h-[120px] flex-1 lg:min-h-0">
            <PanelEmpty
              kind="api_required"
              message="실시간 호가(Level II)는 무료 소스로 제공되지 않습니다. 가짜 호가는 표시하지 않습니다."
            />
          </Panel>
          <Panel title="옵션 플로우 / OPTIONS" className="min-h-[120px] flex-1 lg:min-h-0">
            <PanelEmpty kind="api_required" message="옵션 플로우 데이터 소스 연동이 필요합니다." />
          </Panel>
        </div>
      </main>

      <footer className="flex flex-shrink-0 items-center gap-3 border-t border-border bg-background px-2 py-1 text-[10px] text-muted-foreground">
        <span className="font-bold text-primary">SnapTerminal</span>
        <span>데이터: Yahoo Finance (지연) · Frankfurter FX</span>
        <span className="ml-auto">실데이터 / 지연 / API 필요 / 데이터 없음 상태를 구분 표시합니다.</span>
      </footer>
    </div>
  );
}

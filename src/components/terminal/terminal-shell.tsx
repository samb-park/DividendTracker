"use client";

import { useState, type CSSProperties } from "react";
import { TopBar, type TabKey } from "./top-bar";
import { usePanelLayout } from "./use-panel-layout";
import { IndexStrip } from "./index-strip";
import { Panel } from "./panel";
import { PanelEmpty } from "./panel-state";
import { WatchGridPanel } from "./panels/watch-grid-panel";
import { CandleChartPanel } from "./panels/candle-chart-panel";
import { FundamentalsPanel } from "./panels/fundamentals-panel";
import { MarketOverviewPanel } from "./panels/market-overview-panel";
import { AiAssistantPanel } from "./panels/ai-assistant-panel";
import { PortfolioPanel } from "./panels/portfolio-panel";
import { NewsPanel } from "./panels/news-panel";
import { SectorPanel } from "./panels/sector-panel";
import { MonitorPanel } from "./panels/monitor-panel";

function CenterContent({
  tab,
  ticker,
  onSelectTicker,
}: {
  tab: TabKey;
  ticker: string;
  onSelectTicker: (t: string) => void;
}) {
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
      return <NewsPanel />;
    case "포트":
      return <PortfolioPanel />;
    case "모니터":
      return <MonitorPanel selected={ticker} onSelect={onSelectTicker} />;
    case "AI":
      return <AiAssistantPanel ticker={ticker} />;
    default:
      return <PanelEmpty kind="no_data" />;
  }
}

export function TerminalShell() {
  const [tab, setTab] = useState<TabKey>("차트");
  const [ticker, setTicker] = useState("AAPL");
  const layout = usePanelLayout();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background lg:h-[100dvh] lg:overflow-hidden">
      <TopBar activeTab={tab} onTabChange={setTab} onCommand={setTicker} />
      <IndexStrip />

      <main
        className="grid min-h-0 flex-1 grid-cols-1 gap-1 overflow-y-auto p-1 lg:gap-0 lg:overflow-hidden lg:[grid-template-columns:var(--term-cols)]"
        style={{ "--term-cols": `${layout.leftW}px 6px minmax(0,1fr) 6px ${layout.rightW}px` } as CSSProperties}
      >
        {/* LEFT */}
        <div className="flex min-h-0 flex-col gap-1 lg:overflow-hidden">
          <Panel
            title="관심종목 / WATCH"
            className="min-h-[240px] flex-1 lg:min-h-0"
            noPadding
          >
            <WatchGridPanel selected={ticker} onSelect={setTicker} />
          </Panel>
          <Panel title="섹터 / SECTOR" className="min-h-[200px] flex-1 lg:min-h-0">
            <SectorPanel />
          </Panel>
        </div>

        {/* RESIZER: left | center */}
        <div
          onPointerDown={layout.startResize("left")}
          role="separator"
          aria-orientation="vertical"
          aria-label="좌측 패널 폭 조절"
          className="group hidden cursor-col-resize items-center justify-center lg:flex"
        >
          <div className="h-10 w-[3px] rounded-full bg-border transition-colors group-hover:bg-primary" />
        </div>

        {/* CENTER */}
        <div className="flex min-h-0 flex-col gap-1 lg:overflow-hidden">
          <Panel
            title={`${tab}${tab === "차트" ? ` · ${ticker}` : ""}`}
            className="min-h-[400px] flex-1 lg:min-h-0"
            noPadding
          >
            <CenterContent tab={tab} ticker={ticker} onSelectTicker={setTicker} />
          </Panel>
        </div>

        {/* RESIZER: center | right */}
        <div
          onPointerDown={layout.startResize("right")}
          role="separator"
          aria-orientation="vertical"
          aria-label="우측 패널 폭 조절"
          className="group hidden cursor-col-resize items-center justify-center lg:flex"
        >
          <div className="h-10 w-[3px] rounded-full bg-border transition-colors group-hover:bg-primary" />
        </div>

        {/* RIGHT */}
        <div className="flex min-h-0 flex-col gap-1 lg:overflow-hidden">
          <Panel title="펀더멘털 / FUNDAMENTALS" className="min-h-[200px] flex-1 lg:min-h-0">
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
        <button
          onClick={layout.reset}
          className="ml-auto rounded-sm border border-border px-1.5 py-0.5 transition-colors hover:border-primary/50 hover:text-foreground"
        >
          레이아웃 초기화
        </button>
        <span className="hidden lg:inline">실데이터 / 지연 / API 필요 / 데이터 없음 구분 표시</span>
      </footer>
    </div>
  );
}

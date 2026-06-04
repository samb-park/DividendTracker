"use client";

import { useQuotes } from "../use-quotes";
import { fmtPrice, fmtPct, fmtChange, toneClass } from "../format";
import { PanelEmpty, DataBadge } from "../panel-state";
import { cn } from "@/lib/utils";
import type { MarketQuote } from "@/app/api/market/quotes/route";

const GROUPS: { title: string; symbols: string[] }[] = [
  { title: "지수", symbols: ["^GSPC", "^IXIC", "^DJI", "^NDX", "^RUT", "^VIX"] },
  { title: "금리/원자재", symbols: ["^TNX", "^TYX", "CL=F", "GC=F", "SI=F", "HG=F"] },
  { title: "환율", symbols: ["USDKRW=X", "EURUSD=X", "USDJPY=X", "DX-Y.NYB"] },
  { title: "한국", symbols: ["^KS11", "^KQ11"] },
];

const ALL = GROUPS.flatMap((g) => g.symbols);

const LABELS: Record<string, string> = {
  "^GSPC": "S&P 500", "^IXIC": "NASDAQ", "^DJI": "Dow Jones", "^NDX": "Nasdaq 100",
  "^RUT": "Russell 2000", "^VIX": "VIX", "^TNX": "US 10Y", "^TYX": "US 30Y",
  "CL=F": "WTI 원유", "GC=F": "금", "SI=F": "은", "HG=F": "구리",
  "USDKRW=X": "USD/KRW", "EURUSD=X": "EUR/USD", "USDJPY=X": "USD/JPY", "DX-Y.NYB": "달러인덱스",
  "^KS11": "KOSPI", "^KQ11": "KOSDAQ",
};

function QuoteRow({ q }: { q: MarketQuote | undefined; }) {
  if (!q) return null;
  const dead = q.status === "no_data";
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/40 py-1">
      <span className="truncate text-[11px] font-semibold text-foreground">
        {LABELS[q.symbol] ?? q.symbol}
      </span>
      {dead ? (
        <span className="text-[10px] text-muted-foreground">데이터없음</span>
      ) : (
        <span className="flex items-baseline gap-2">
          <span className="tabular-nums text-[11px] text-foreground">{fmtPrice(q.price)}</span>
          <span className={cn("w-16 text-right tabular-nums text-[11px]", toneClass(q.change))}>
            {fmtChange(q.change)}
          </span>
          <span className={cn("w-16 text-right tabular-nums text-[11px]", toneClass(q.changePercent))}>
            {fmtPct(q.changePercent)}
          </span>
        </span>
      )}
    </div>
  );
}

export function MarketOverviewPanel() {
  const { quotes, loading, error, stale } = useQuotes(ALL, 60_000);
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));

  if (loading && quotes.length === 0) return <PanelEmpty kind="loading" />;
  if (error && quotes.length === 0) return <PanelEmpty kind="error" message="시장 데이터 로드 실패" />;

  return (
    <div className="grid grid-cols-1 gap-3 p-1 md:grid-cols-2">
      {GROUPS.map((g) => (
        <div key={g.title} className="min-w-0">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-accent">{g.title}</h3>
            <DataBadge kind={stale ? "error" : "delayed"} label={stale ? "갱신실패" : "지연"} />
          </div>
          {g.symbols.map((s) => (
            <QuoteRow key={s} q={bySymbol.get(s)} />
          ))}
        </div>
      ))}
    </div>
  );
}

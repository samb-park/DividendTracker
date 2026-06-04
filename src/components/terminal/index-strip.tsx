"use client";

import { useQuotes } from "./use-quotes";
import { fmtPrice, fmtPct, toneClass } from "./format";
import { cn } from "@/lib/utils";

/** Index / macro strip across the top of the terminal — real (delayed) quotes. */
const STRIP_SYMBOLS = ["^GSPC", "^IXIC", "^DJI", "^NDX", "^VIX", "^TNX", "CL=F", "GC=F"];

const LABELS: Record<string, string> = {
  "^GSPC": "S&P500",
  "^IXIC": "NASDAQ",
  "^DJI": "DOW",
  "^NDX": "NDX",
  "^VIX": "VIX",
  "^TNX": "US10Y",
  "CL=F": "WTI",
  "GC=F": "GOLD",
};

export function IndexStrip() {
  const { quotes, loading, error, stale } = useQuotes(STRIP_SYMBOLS, 60_000);

  return (
    <div className="flex items-center gap-0 overflow-x-auto whitespace-nowrap border-b border-border bg-background/80 px-2 text-[11px]">
      <span className="mr-2 flex-shrink-0 font-bold uppercase tracking-wide text-accent">INDEX</span>
      {stale && (
        <span className="mr-2 flex-shrink-0 font-semibold text-destructive" title="실시간 갱신 실패 — 마지막 수신값">
          ⚠ 갱신실패
        </span>
      )}
      {loading && quotes.length === 0 && (
        <span className="py-1 text-muted-foreground">불러오는 중…</span>
      )}
      {error && quotes.length === 0 && (
        <span className="py-1 text-destructive">지수 데이터 오류</span>
      )}
      {quotes.map((q) => {
        const label = LABELS[q.symbol] ?? q.symbol;
        if (q.status === "no_data") {
          return (
            <span key={q.symbol} className="flex-shrink-0 px-2 py-1 text-muted-foreground">
              <span className="font-bold">{label}</span> <span className="text-[10px]">데이터없음</span>
            </span>
          );
        }
        return (
          <span key={q.symbol} className="flex flex-shrink-0 items-baseline gap-1 px-2 py-1">
            <span className="font-bold text-foreground">{label}</span>
            <span className="tabular-nums text-foreground">{fmtPrice(q.price)}</span>
            <span className={cn("tabular-nums", toneClass(q.changePercent))}>
              {fmtPct(q.changePercent)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

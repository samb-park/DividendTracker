"use client";

import { useQuotes } from "../use-quotes";
import { fmtPrice, fmtPct, toneClass } from "../format";
import { PanelEmpty } from "../panel-state";
import { cn } from "@/lib/utils";

const DEFAULT_WATCH = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META",
  "TSLA", "AVGO", "SCHD", "QQQM", "JEPQ", "SGOV",
];

export function WatchGridPanel({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (ticker: string) => void;
}) {
  const { quotes, loading, error } = useQuotes(DEFAULT_WATCH, 60_000);

  if (loading && quotes.length === 0) return <PanelEmpty kind="loading" />;
  if (error && quotes.length === 0)
    return <PanelEmpty kind="error" message="시세를 불러오지 못했습니다." />;

  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr className="text-[9px] uppercase tracking-wide text-muted-foreground">
          <th className="px-1 py-1 text-left font-semibold">티커</th>
          <th className="px-1 py-1 text-right font-semibold">현재가</th>
          <th className="px-1 py-1 text-right font-semibold">등락%</th>
        </tr>
      </thead>
      <tbody>
        {quotes.map((q) => {
          const isSel = q.symbol === selected;
          const dead = q.status === "no_data";
          return (
            <tr
              key={q.symbol}
              onClick={() => !dead && onSelect(q.symbol)}
              className={cn(
                "cursor-pointer border-t border-border/50 transition-colors",
                isSel ? "bg-primary/15" : "hover:bg-secondary/50",
                dead && "cursor-default opacity-50"
              )}
            >
              <td className="px-1 py-1 text-left font-bold text-foreground">{q.symbol}</td>
              <td className="px-1 py-1 text-right tabular-nums text-foreground">
                {dead ? "—" : fmtPrice(q.price)}
              </td>
              <td className={cn("px-1 py-1 text-right tabular-nums", toneClass(q.changePercent))}>
                {dead ? "데이터없음" : fmtPct(q.changePercent)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

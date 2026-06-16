"use client";

import { useEffect, useState } from "react";
import { useQuotes } from "../use-quotes";
import { fmtPrice, fmtPct, fmtChange, toneClass } from "../format";
import { PanelEmpty, DataBadge } from "../panel-state";
import { cn } from "@/lib/utils";

const KEY = "snapterminal-monitor-v1";
const DEFAULT_LIST = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO",
  "^GSPC", "^IXIC", "^NDX", "SCHD", "QQQM", "JEPQ", "SGOV", "TQQQ",
];

/**
 * 모니터: a dense, editable multi-ticker wall. Real (delayed) quotes via
 * /api/market/quotes; failed symbols show "데이터없음" rather than a fake price.
 * The list is persisted per-browser to localStorage.
 */
export function MonitorPanel({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (ticker: string) => void;
}) {
  const [list, setList] = useState<string[]>(DEFAULT_LIST);
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string") && parsed.length > 0) {
          setList(parsed as string[]);
        }
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }, [list, hydrated]);

  const { quotes, loading, error, stale } = useQuotes(list, 30_000);
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));

  const add = () => {
    const t = draft.trim().toUpperCase();
    if (t && !list.includes(t)) setList((l) => [...l, t]);
    setDraft("");
  };
  const remove = (sym: string) => setList((l) => l.filter((s) => s !== sym));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 px-2 py-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {list.length} 종목
        </span>
        <DataBadge kind={stale ? "error" : "delayed"} label={stale ? "갱신실패" : "지연"} />
        <span className="ml-auto flex items-center overflow-hidden rounded-sm border border-border bg-input">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="티커 추가"
            className="w-24 bg-transparent px-2 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button onClick={add} className="bg-secondary px-2 py-0.5 text-[10px] font-bold hover:text-foreground">
            +
          </button>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-1">
        {loading && quotes.length === 0 ? (
          <PanelEmpty kind="loading" />
        ) : error && quotes.length === 0 ? (
          <PanelEmpty kind="error" message="시세를 불러오지 못했습니다." />
        ) : (
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {list.map((sym) => {
              const q = bySymbol.get(sym);
              const dead = !q || q.status === "no_data";
              const isSel = sym === selected;
              return (
                <div
                  key={sym}
                  onClick={() => !dead && onSelect(sym)}
                  className={cn(
                    "group relative cursor-pointer rounded-sm border p-1.5 transition-colors",
                    isSel ? "border-primary/60 bg-primary/10" : "border-border bg-card hover:bg-secondary/50",
                    dead && "cursor-default opacity-60"
                  )}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(sym);
                    }}
                    aria-label={`${sym} 제거`}
                    className="absolute right-0.5 top-0.5 hidden text-[10px] leading-none text-muted-foreground hover:text-destructive group-hover:block"
                  >
                    ×
                  </button>
                  <div className="truncate text-[11px] font-bold text-foreground">{sym}</div>
                  {dead ? (
                    <div className="text-[10px] text-muted-foreground">데이터없음</div>
                  ) : (
                    <>
                      <div className="tabular-nums text-[12px] text-foreground">{fmtPrice(q.price)}</div>
                      <div className={cn("tabular-nums text-[10px]", toneClass(q.changePercent))}>
                        {fmtChange(q.change)} ({fmtPct(q.changePercent)})
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

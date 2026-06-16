"use client";

import { useEffect, useMemo, useState } from "react";
import { PanelEmpty, DataBadge } from "../panel-state";
import { fmtPct, toneClass } from "../format";
import { cn } from "@/lib/utils";
import type { MarketQuote } from "@/app/api/market/quotes/route";

// ---------------------------------------------------------------------------
// Sector map panel.
//
// HONESTY: /api/sector only classifies each held ticker into a sector NAME — it
// carries NO change data. So the per-sector 등락률 shown here is *derived* from
// real (delayed) quotes: it's the unweighted mean of the real `changePercent`
// of each held ticker in that sector. That is a real computation on real
// inputs, NOT a fabricated number.
//
//   • Tickers whose quote came back `no_data` / null are EXCLUDED from the mean
//     (never coerced to 0 — that would inject a fake 0%).
//   • A sector where *every* member is no_data renders WITHOUT a number.
//   • Each row shows its constituent count so every figure is traceable back
//     to the user's own holdings. This is a holdings-based aggregate, not a
//     market-wide sector index.
// ---------------------------------------------------------------------------

interface SectorResponse {
  sectors: { ticker: string; sector: string }[];
}

interface SectorRow {
  sector: string;
  /** unweighted mean of member changePercent, or null if no live constituent */
  avgChange: number | null;
  /** tickers with a live (delayed) quote feeding the mean */
  liveCount: number;
  /** total tickers classified into this sector (incl. no_data ones) */
  total: number;
}

type Status = "loading" | "ok" | "no_data" | "error";

/**
 * Background tint whose opacity scales with the magnitude of the move.
 * NOTE: every class is spelled out as a full literal so Tailwind's JIT scanner
 * keeps them — interpolated names like `bg-positive/${n}` get purged.
 */
function tintClass(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "bg-transparent";
  const mag = Math.abs(v);
  if (v > 0) {
    if (mag < 0.75) return "bg-positive/10";
    if (mag < 1.5) return "bg-positive/20";
    if (mag < 2.25) return "bg-positive/30";
    return "bg-positive/40";
  }
  if (mag < 0.75) return "bg-negative/10";
  if (mag < 1.5) return "bg-negative/20";
  if (mag < 2.25) return "bg-negative/30";
  return "bg-negative/40";
}

export function SectorPanel() {
  const [rows, setRows] = useState<SectorRow[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setRows([]);

    (async () => {
      // 1) Real sector classification of the user's holdings.
      const sectorRes = await fetch("/api/sector", { cache: "no-store" });
      if (!alive) return;
      if (!sectorRes.ok) {
        setStatus("error");
        return;
      }
      const sectorBody = (await sectorRes.json()) as SectorResponse;
      const mappings = sectorBody.sectors ?? [];
      if (mappings.length === 0) {
        // 200 with empty array = no active holdings to classify.
        setStatus("no_data");
        return;
      }

      // 2) Real (delayed) quotes for those exact tickers.
      const symbols = Array.from(new Set(mappings.map((m) => m.ticker)));
      const quoteRes = await fetch(
        `/api/market/quotes?symbols=${encodeURIComponent(symbols.join(","))}`,
        { cache: "no-store" }
      );
      if (!alive) return;
      if (!quoteRes.ok) {
        setStatus("error");
        return;
      }
      const quoteBody = (await quoteRes.json()) as { quotes: MarketQuote[] };
      const changeBySymbol = new Map<string, number | null>();
      for (const q of quoteBody.quotes ?? []) {
        const live = q.status === "delayed" ? q.changePercent : null;
        changeBySymbol.set(q.symbol.toUpperCase(), live);
      }

      // 3) Group by sector; mean of *live* constituents only.
      const groups = new Map<string, { sum: number; live: number; total: number }>();
      for (const m of mappings) {
        const g = groups.get(m.sector) ?? { sum: 0, live: 0, total: 0 };
        g.total += 1;
        const chg = changeBySymbol.get(m.ticker.toUpperCase());
        if (chg != null && Number.isFinite(chg)) {
          g.sum += chg;
          g.live += 1;
        }
        groups.set(m.sector, g);
      }

      const next: SectorRow[] = Array.from(groups.entries()).map(([sector, g]) => ({
        sector,
        avgChange: g.live > 0 ? g.sum / g.live : null,
        liveCount: g.live,
        total: g.total,
      }));

      if (!alive) return;
      setRows(next);
      setStatus("ok");
    })().catch(() => {
      if (alive) setStatus("error");
    });

    return () => {
      alive = false;
    };
  }, []);

  // Sort: live sectors by change desc, then no-data sectors at the bottom.
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.avgChange == null && b.avgChange == null) return a.sector.localeCompare(b.sector);
      if (a.avgChange == null) return 1;
      if (b.avgChange == null) return -1;
      return b.avgChange - a.avgChange;
    });
  }, [rows]);

  if (status === "loading") return <PanelEmpty kind="loading" />;
  if (status === "error") return <PanelEmpty kind="error" message="섹터 데이터를 불러오지 못했습니다." />;
  if (status === "no_data")
    return (
      <PanelEmpty
        kind="no_data"
        message="분류할 보유 종목이 없습니다. 보유 종목이 추가되면 섹터별 등락이 표시됩니다."
      />
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-2 py-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-accent">
          보유 섹터 등락
        </span>
        <DataBadge kind="delayed" label="Yahoo 지연" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.map((r) => {
          const dead = r.avgChange == null;
          return (
            <div
              key={r.sector}
              className={cn(
                "flex items-baseline justify-between gap-2 border-b border-border/40 px-2 py-1 transition-colors",
                tintClass(r.avgChange)
              )}
            >
              <span className="flex min-w-0 items-baseline gap-1">
                <span className="truncate text-[11px] font-semibold text-foreground">
                  {r.sector}
                </span>
                <span className="flex-shrink-0 text-[9px] tabular-nums text-muted-foreground">
                  ({dead ? `0/${r.total}` : `${r.liveCount}/${r.total}`})
                </span>
              </span>
              {dead ? (
                <span className="flex-shrink-0 text-[10px] text-muted-foreground">데이터없음</span>
              ) : (
                <span
                  className={cn(
                    "flex-shrink-0 tabular-nums text-[11px] font-semibold",
                    toneClass(r.avgChange)
                  )}
                >
                  {fmtPct(r.avgChange)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex-shrink-0 border-t border-border px-2 py-1 text-[9px] leading-tight text-muted-foreground">
        보유 종목을 섹터로 분류해 구성 종목 등락률의 단순 평균을 표시합니다. 시장 전체 섹터 지수가
        아닙니다.
      </div>
    </div>
  );
}

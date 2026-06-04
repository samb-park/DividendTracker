"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PanelEmpty, DataBadge } from "../panel-state";
import { fmtPrice, fmtPct, toneClass } from "../format";
import { cn } from "@/lib/utils";

/**
 * Portfolio panel for SnapTerminal — the user's REAL portfolio.
 *
 * Data sources (all existing routes, single-user mode, no auth needed):
 *  - PRIMARY  /api/v2/allocation   → holdings, CAD value, weight, target, drift,
 *                                     rebalance contribution, per-row currency, fx.
 *  - /api/snapshots?range=1y       → portfolio-level open P&L (totalCAD/costBasisCAD/cashCAD).
 *  - /api/dividend-income?mode=future → forward dividend projection (annual/monthly).
 *  - /api/sector                   → sector per ticker.
 *
 * Honesty rules: the panel never fabricates numbers. The PRIMARY source drives
 * the loading/no_data/error state. Secondary sources (P&L, dividend forecast,
 * sectors) degrade independently to "—" / a small note and never invent values.
 * Per-ticker P&L is intentionally omitted: v2/allocation carries no per-position
 * cost basis, and reconstructing it would require transaction-level math we do
 * not fake here.
 */

// ---- /api/v2/allocation response (subset we consume) ----------------------
interface V2NormalRow {
  ticker: string;
  currency: "CAD" | "USD";
  shares: number;
  priceLocal: number | null;
  valueCAD: number;
  rawTargetPct: number;
  normalizedTargetPct: number;
  suggestedContributionCAD: number;
  driftPct: number;
  missingPrice: boolean;
}
interface V2ExcludedRow {
  ticker: string;
  currency: "CAD" | "USD";
  shares: number;
  priceLocal: number | null;
  valueCAD: number;
  reserveTargetPct: number;
  currentReservePct: number;
  status: "below_target" | "at_target" | "above_target" | "inactive";
  missingPrice: boolean;
}
interface AllocationResponse {
  totalValueCAD: number;
  fxRate: number;
  fxFallback: boolean;
  normalRows: V2NormalRow[];
  excludedRows: V2ExcludedRow[];
  warnings: string[];
}

// ---- /api/snapshots response (subset) -------------------------------------
interface SnapshotPoint {
  date: string;
  totalCAD: number;
  costBasisCAD: number;
  cashCAD: number;
}
interface SnapshotsResponse {
  snapshots: SnapshotPoint[];
}

// ---- /api/dividend-income response (subset) -------------------------------
interface DivItem {
  ticker: string;
  net: number;
  amount: number;
  currency: string;
}
interface DivMonth {
  month: string;
  items: DivItem[];
}
interface DividendResponse {
  months: DivMonth[];
}

// ---- /api/sector response -------------------------------------------------
interface SectorResponse {
  sectors: { ticker: string; sector: string }[];
}

type Status = "loading" | "ok" | "no_data" | "error";

/** Derived, honestly-typed secondary metrics. null = source absent/failed. */
interface DividendForecast {
  annualCAD: number;
  monthlyCAD: number;
}
interface OpenPnL {
  marketValueCAD: number;
  costBasisCAD: number;
  pnlCAD: number;
  pnlPct: number;
  asOf: string;
}

function fmtCAD(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `C$${Math.round(v).toLocaleString("en-US")}`;
}

function Tile({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-sm border border-border bg-card px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="truncate text-[13px] font-bold tabular-nums text-foreground">{children}</span>
    </div>
  );
}

function driftTone(drift: number): string {
  if (!Number.isFinite(drift)) return "text-muted-foreground";
  if (Math.abs(drift) <= 2) return "text-muted-foreground";
  // overweight (positive drift) is red, underweight (negative) is green-to-buy
  return drift > 0 ? "text-negative" : "text-positive";
}

export function PortfolioPanel() {
  const [alloc, setAlloc] = useState<AllocationResponse | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  // Secondary, independently-degrading sources.
  const [pnl, setPnl] = useState<OpenPnL | null>(null);
  const [dividend, setDividend] = useState<DividendForecast | null>(null);
  const [sectorMap, setSectorMap] = useState<Record<string, string> | null>(null);

  // 1. PRIMARY load — drives the overall panel state.
  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setAlloc(null);
    fetch("/api/v2/allocation", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) return { kind: "no_data" as const };
        if (!res.ok) return { kind: "error" as const };
        return { kind: "ok" as const, body: (await res.json()) as AllocationResponse };
      })
      .then((r) => {
        if (!alive) return;
        if (r.kind === "ok") {
          const rows = (r.body.normalRows?.length ?? 0) + (r.body.excludedRows?.length ?? 0);
          if (rows === 0) {
            setStatus("no_data");
          } else {
            setAlloc(r.body);
            setStatus("ok");
          }
        } else {
          setStatus(r.kind);
        }
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, []);

  // 2. Open P&L from snapshots — portfolio-level, self-consistent within snapshots.
  useEffect(() => {
    let alive = true;
    fetch("/api/snapshots?range=1y", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<SnapshotsResponse>) : null))
      .then((body) => {
        if (!alive || !body) return;
        const points = body.snapshots ?? [];
        const last = points[points.length - 1];
        if (!last) return;
        const marketValueCAD = last.totalCAD - last.cashCAD;
        const costBasisCAD = last.costBasisCAD;
        if (!(costBasisCAD > 0)) return; // no cost basis → cannot state P&L honestly
        const pnlCAD = marketValueCAD - costBasisCAD;
        setPnl({
          marketValueCAD,
          costBasisCAD,
          pnlCAD,
          pnlPct: (pnlCAD / costBasisCAD) * 100,
          asOf: last.date,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 3. Forward dividend forecast — convert each item's net to CAD with v2 fxRate.
  useEffect(() => {
    if (!alloc) return;
    let alive = true;
    const fx = alloc.fxRate > 0 ? alloc.fxRate : 1;
    const year = new Date().getFullYear();
    fetch(`/api/dividend-income?mode=future&year=${year}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<DividendResponse>) : null))
      .then((body) => {
        if (!alive || !body) return;
        const months = body.months ?? [];
        let annualCAD = 0;
        for (const m of months) {
          for (const it of m.items ?? []) {
            const net = Number(it.net);
            if (!Number.isFinite(net)) continue;
            annualCAD += it.currency === "USD" ? net * fx : net;
          }
        }
        if (annualCAD <= 0) return; // no projectable dividends → leave as "—"
        setDividend({ annualCAD, monthlyCAD: annualCAD / 12 });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [alloc]);

  // 4. Sector map (optional enrichment).
  useEffect(() => {
    let alive = true;
    fetch("/api/sector", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<SectorResponse>) : null))
      .then((body) => {
        if (!alive || !body) return;
        const map: Record<string, string> = {};
        for (const s of body.sectors ?? []) map[s.ticker.toUpperCase()] = s.sector;
        setSectorMap(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // ---- derived views ------------------------------------------------------
  const allRows = useMemo(() => {
    if (!alloc) return [];
    const normal = alloc.normalRows.map((r) => ({
      ticker: r.ticker,
      currency: r.currency,
      shares: r.shares,
      priceLocal: r.priceLocal,
      valueCAD: r.valueCAD,
      targetPct: r.normalizedTargetPct,
      driftPct: r.driftPct,
      suggestedCAD: r.suggestedContributionCAD,
      missingPrice: r.missingPrice,
      nonCore: false,
    }));
    const excluded = alloc.excludedRows.map((r) => ({
      ticker: r.ticker,
      currency: r.currency,
      shares: r.shares,
      priceLocal: r.priceLocal,
      valueCAD: r.valueCAD,
      targetPct: r.reserveTargetPct,
      driftPct: r.currentReservePct - r.reserveTargetPct,
      suggestedCAD: 0,
      missingPrice: r.missingPrice,
      nonCore: true,
    }));
    return [...normal, ...excluded].sort((a, b) => b.valueCAD - a.valueCAD);
  }, [alloc]);

  const total = alloc?.totalValueCAD ?? 0;

  const currencySplit = useMemo(() => {
    let usd = 0;
    let cad = 0;
    for (const r of allRows) {
      if (r.currency === "USD") usd += r.valueCAD;
      else cad += r.valueCAD;
    }
    return { usd, cad };
  }, [allRows]);

  const sectorEntries = useMemo(() => {
    if (!sectorMap) return null;
    const bySector = new Map<string, number>();
    for (const r of allRows) {
      const sector = sectorMap[r.ticker] ?? "Other";
      bySector.set(sector, (bySector.get(sector) ?? 0) + r.valueCAD);
    }
    return Array.from(bySector.entries())
      .map(([sector, value]) => ({ sector, value }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [sectorMap, allRows]);

  const rebalanceCount = useMemo(
    () =>
      allRows.filter(
        (r) => !r.nonCore && r.targetPct > 0 && Number.isFinite(r.driftPct) && Math.abs(r.driftPct) > 2
      ).length,
    [allRows]
  );

  if (status === "loading") return <PanelEmpty kind="loading" />;
  if (status === "no_data")
    return (
      <PanelEmpty
        kind="no_data"
        message="보유 종목이 없습니다. 설정에서 포트폴리오를 만들고 종목을 추가하세요."
      />
    );
  if (status === "error" || !alloc)
    return <PanelEmpty kind="error" message="포트폴리오 데이터를 불러오지 못했습니다." />;

  const sectorTotal = sectorEntries?.reduce((s, e) => s + e.value, 0) ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {/* Header summary */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 px-2 py-1.5">
        <span className="text-sm font-bold text-foreground">내 포트폴리오</span>
        <span className="ml-auto flex items-center gap-1.5">
          <DataBadge kind="delayed" label="CAD 환산" />
          {alloc.fxFallback && <DataBadge kind="api_required" label="FX 대체값" />}
        </span>
      </div>

      {/* Summary tiles */}
      <div className="grid flex-shrink-0 grid-cols-2 gap-1.5 px-2 pb-2 md:grid-cols-4">
        <Tile label="평가금액">{fmtCAD(total)}</Tile>
        <Tile label="손익 (스냅샷)">
          {pnl ? (
            <span className={toneClass(pnl.pnlCAD)}>
              {pnl.pnlCAD >= 0 ? "+" : "−"}
              {fmtCAD(Math.abs(pnl.pnlCAD))} ({fmtPct(pnl.pnlPct)})
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Tile>
        <Tile label="배당 예상 (연)">
          {dividend ? fmtCAD(dividend.annualCAD) : <span className="text-muted-foreground">—</span>}
        </Tile>
        <Tile label="배당 예상 (월)">
          {dividend ? fmtCAD(dividend.monthlyCAD) : <span className="text-muted-foreground">—</span>}
        </Tile>
      </div>

      {/* Currency + rebalance strip */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-y border-border/60 px-2 py-1 text-[10px]">
        <span className="text-muted-foreground">
          통화{" "}
          <span className="tabular-nums text-foreground">
            USD {total > 0 ? ((currencySplit.usd / total) * 100).toFixed(0) : "0"}%
          </span>{" "}
          ·{" "}
          <span className="tabular-nums text-foreground">
            CAD {total > 0 ? ((currencySplit.cad / total) * 100).toFixed(0) : "0"}%
          </span>
        </span>
        <span className="text-muted-foreground">
          리밸런싱{" "}
          {rebalanceCount > 0 ? (
            <span className="text-accent">{rebalanceCount}개 종목 갭 &gt;2%</span>
          ) : (
            <span className="text-positive">목표 근접</span>
          )}
        </span>
      </div>

      {/* Holdings table */}
      <div className="min-h-0 flex-1">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-1 text-left font-semibold">종목</th>
              <th className="px-2 py-1 text-right font-semibold">수량</th>
              <th className="px-2 py-1 text-right font-semibold">가격</th>
              <th className="px-2 py-1 text-right font-semibold">평가(CAD)</th>
              <th className="px-2 py-1 text-right font-semibold">비중</th>
              <th className="px-2 py-1 text-right font-semibold">목표</th>
              <th className="px-2 py-1 text-right font-semibold">갭</th>
              <th className="px-2 py-1 text-right font-semibold">추가매수</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((r) => {
              const weight = total > 0 ? (r.valueCAD / total) * 100 : 0;
              return (
                <tr key={r.ticker} className="border-b border-border/40 hover:bg-card">
                  <td className="px-2 py-1">
                    <span className="font-semibold text-foreground">{r.ticker}</span>
                    {r.nonCore && (
                      <span className="ml-1 text-[9px] uppercase text-muted-foreground">non-core</span>
                    )}
                    {r.missingPrice && (
                      <span className="ml-1 text-[9px] uppercase text-negative">가격없음</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                    {r.shares.toLocaleString("en-US")}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                    {r.priceLocal != null ? (
                      <>
                        {fmtPrice(r.priceLocal)}
                        <span className="ml-0.5 text-[9px] text-muted-foreground/60">{r.currency}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-foreground">{fmtCAD(r.valueCAD)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-foreground">{weight.toFixed(1)}%</td>
                  <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                    {r.targetPct > 0 ? `${r.targetPct.toFixed(1)}%` : "—"}
                  </td>
                  <td className={cn("px-2 py-1 text-right tabular-nums", driftTone(r.driftPct))}>
                    {r.targetPct > 0 ? fmtPct(r.driftPct) : "—"}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                    {r.suggestedCAD > 0.5 ? fmtCAD(r.suggestedCAD) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Sector breakdown */}
        <div className="px-2 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">섹터 비중</div>
          {sectorEntries == null ? (
            <div className="text-[10px] text-muted-foreground">섹터 데이터 불러오는 중…</div>
          ) : sectorEntries.length === 0 ? (
            <div className="text-[10px] text-muted-foreground">섹터 데이터 없음</div>
          ) : (
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              {sectorEntries.map((e) => {
                const pct = sectorTotal > 0 ? (e.value / sectorTotal) * 100 : 0;
                return (
                  <div key={e.sector} className="flex items-center gap-2 text-[10px]">
                    <span className="min-w-0 flex-1 truncate text-foreground">{e.sector}</span>
                    <div className="h-1.5 w-16 overflow-hidden rounded-[1px] bg-border">
                      <div className="h-full bg-primary/70" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span className="w-9 text-right tabular-nums text-muted-foreground">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footnote: honest scope disclosure */}
      <div className="flex-shrink-0 border-t border-border/60 px-2 py-1 text-[9px] leading-relaxed text-muted-foreground">
        평가/비중/갭/추가매수는 /api/v2/allocation, 손익은 /api/snapshots, 배당 예상은 /api/dividend-income(예측),
        섹터는 /api/sector 실데이터입니다. 종목별 손익은 원가정보가 없어 표시하지 않습니다.
      </div>
    </div>
  );
}

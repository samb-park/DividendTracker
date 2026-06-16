"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Basis, TickerAgg } from "@/lib/pocket-types";
import { Panel } from "./terminal/panel";
import { MetricCell } from "./terminal/metric-cell";
import { NumberText } from "./terminal/number-text";
import { DenseTable, type DenseColumn } from "./terminal/dense-table";
import { fmtUsd, fmtUsdCompact, fmtPct } from "./terminal/format";

/** NET / GROSS segmented toggle — MDD BasisToggle look. */
function BasisToggle({ value, onChange }: { value: Basis; onChange: (b: Basis) => void }) {
  const opts: { v: Basis; label: string }[] = [
    { v: "net", label: "NET" },
    { v: "gross", label: "GROSS" },
  ];
  return (
    <span className="inline-flex border border-border-bright">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide pointer-coarse:min-h-9 pointer-coarse:px-3",
            value === o.v ? "bg-panel-header text-text-hi" : "text-text-low hover:text-text-mid",
          )}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

interface Props {
  annualUSD: number;
  totalValueUSD: number;
  avgYieldPct: number;
  included: TickerAgg[];
  basis: Basis;
  setBasis: (b: Basis) => void;
  loading: boolean;
  error: boolean;
  isEmpty: boolean;
  allExcluded: boolean;
  priceGap: boolean;
  freqGuess: boolean;
  fxFallback: boolean;
  onRetry: () => void;
}

/**
 * Dividends tab content, MDD terminal layout: a DIVIDEND RUN-RATE metric panel
 * (YEARLY headline + MONTHLY/WEEKLY/DAILY + YIELD/VALUE) over a HOLDINGS dense
 * table. Replaces the old full-screen D/W/M/Y hero.
 */
export function DividendsContent({
  annualUSD,
  totalValueUSD,
  avgYieldPct,
  included,
  basis,
  setBasis,
  loading,
  error,
  isEmpty,
  allExcluded,
  priceGap,
  freqGuess,
  fxFallback,
  onRetry,
}: Props) {
  const pick = (t: TickerAgg) => (basis === "net" ? t.netAnnualUSD : t.grossAnnualUSD);
  const showZero = !loading && (isEmpty || allExcluded);
  const yr = showZero ? 0 : annualUSD;

  const columns = useMemo<DenseColumn<TickerAgg>[]>(
    () => [
      {
        key: "ticker",
        header: "SYMBOL",
        sortValue: (t) => t.ticker,
        cell: (t) => <span className="font-medium uppercase text-text-hi">{t.ticker}</span>,
      },
      {
        key: "annual",
        header: "ANNUAL",
        align: "right",
        sortValue: (t) => pick(t),
        cell: (t) => <NumberText value={fmtUsd(pick(t))} intent="cyan" />,
      },
      {
        key: "yield",
        header: "YIELD",
        align: "right",
        sortValue: (t) => (t.marketValueUSD ? pick(t) / t.marketValueUSD : -1),
        cell: (t) => (
          <NumberText
            value={
              t.marketValueUSD != null && t.marketValueUSD !== 0
                ? fmtPct((pick(t) / t.marketValueUSD) * 100)
                : "—"
            }
          />
        ),
      },
      {
        key: "value",
        header: "VALUE",
        align: "right",
        sortValue: (t) => t.marketValueUSD ?? -1,
        cell: (t) => (
          <NumberText value={t.marketValueUSD != null ? fmtUsdCompact(t.marketValueUSD) : "—"} />
        ),
      },
    ],
    [basis],
  );

  return (
    <div className="space-y-1.5 pb-2">
      <Panel
        title="DIVIDEND RUN-RATE"
        titleRight={<BasisToggle value={basis} onChange={setBasis} />}
        loading={loading}
        error={error ? "데이터를 불러오지 못했습니다" : null}
        onRetry={onRetry}
      >
        {isEmpty || allExcluded ? (
          <div className="flex h-28 flex-col items-center justify-center gap-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-low">
              {isEmpty ? "NO HOLDINGS" : "NOTHING SELECTED"}
            </span>
            <span className="text-[10px] text-text-low">
              {isEmpty ? "보유 종목이 없습니다" : "Settings에서 포트폴리오를 확인하세요"}
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-end justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-[0.12em] text-text-mid">YEARLY</span>
                <NumberText value={fmtUsd(yr)} intent="cyan" className="text-2xl font-bold leading-none" />
              </div>
              {fxFallback && (
                <span className="font-mono text-[9px] uppercase tracking-wider text-warn">⚠ FX 추정</span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-hairline pt-2">
              <MetricCell label="MONTHLY" value={fmtUsd(yr / 12)} />
              <MetricCell label="WEEKLY" value={fmtUsd(yr / 52)} />
              <MetricCell label="DAILY" value={fmtUsd(yr / 365, 2)} />
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-hairline pt-2">
              <MetricCell label="YIELD" value={fmtPct(showZero ? 0 : avgYieldPct)} />
              <MetricCell label="VALUE" value={fmtUsdCompact(showZero ? 0 : totalValueUSD)} />
            </div>

            {(priceGap || freqGuess) && (
              <div className="space-y-0.5 border-t border-hairline pt-2">
                {priceGap && (
                  <p className="font-mono text-[9px] uppercase tracking-wider text-warn">
                    ⚠ 일부 종목 시세 없음 — VALUE/YIELD에서 제외
                  </p>
                )}
                {freqGuess && (
                  <p className="font-mono text-[9px] uppercase tracking-wider text-warn">
                    ⚠ 일부 종목 빈도 추정 — 연간 추정치
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel title="HOLDINGS" titleRight={
        <span className="font-mono text-[9px] uppercase tracking-wider text-text-low">
          {included.length} {included.length === 1 ? "name" : "names"}
        </span>
      } loading={loading} bodyClassName="p-0">
        <DenseTable
          columns={columns}
          data={included}
          initialSort={{ key: "annual", desc: true }}
          emptyText="보유 종목 없음"
        />
      </Panel>
    </div>
  );
}

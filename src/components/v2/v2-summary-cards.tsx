"use client";

import { fmtCAD, fmtPct, fmtSignedPct } from "./format";
import type { V2AllocationData } from "@/lib/v2-data";

export function V2SummaryCards({ data }: { data: V2AllocationData }) {
  const totalDriftAbs = data.normalRows.reduce(
    (s, r) => s + Math.abs(r.driftPct),
    0,
  );
  const avgDrift = data.normalRows.length > 0 ? totalDriftAbs / data.normalRows.length : 0;

  const reserveProgress =
    data.excludedRows.length === 0
      ? null
      : data.excludedRows.reduce((s, r) => {
          if (!r.active || r.reserveTargetPct <= 0) return s;
          const ratio = Math.min(1, r.currentReservePct / r.reserveTargetPct);
          return s + ratio;
        }, 0) / Math.max(1, data.excludedRows.filter((r) => r.active && r.reserveTargetPct > 0).length);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Card label="Total" value={fmtCAD(data.totalValueCAD, { compact: true })} hint="portfolio value" />
      <Card
        label="Weekly"
        value={fmtCAD(data.contributionCAD, { compact: true })}
        hint={
          data.contributionCurrency === "USD"
            ? `${data.contributionAmount.toFixed(2)} USD`
            : data.contributionFrequency
        }
      />
      <Card
        label="USD/CAD"
        value={data.fxRate.toFixed(4)}
        hint={data.fxFallback ? "fallback" : "live"}
        warn={data.fxFallback}
      />
      <Card
        label="Reserve"
        value={reserveProgress == null ? "—" : fmtPct(reserveProgress * 100, 0)}
        hint={
          data.excludedRows.length === 0
            ? "no excluded"
            : `${data.excludedRows.filter((r) => r.status === "at_target" || r.status === "above_target").length}/${data.excludedRows.length} on target`
        }
      />
      <Card
        label="Avg Drift"
        value={fmtSignedPct(avgDrift, 1)}
        hint="normal targets"
      />
    </div>
  );
}

function Card({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-card px-4 py-3 ${
        warn ? "border-accent/40" : "border-border"
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

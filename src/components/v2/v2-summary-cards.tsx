"use client";

import { fmtCAD, fmtPct, fmtSignedPct } from "./format";
import type { V2AllocationData } from "@/lib/v2-data";

export function V2SummaryCards({ data }: { data: V2AllocationData }) {
  const totalDriftAbs = data.normalRows.reduce(
    (s, r) => s + Math.abs(r.driftPct),
    0,
  );
  const avgDrift = data.normalRows.length > 0 ? totalDriftAbs / data.normalRows.length : 0;

  const reserveActive = data.excludedRows.filter((r) => r.active && r.reserveTargetPct > 0);
  const reserveProgress =
    reserveActive.length === 0
      ? null
      : reserveActive.reduce(
          (s, r) => s + Math.min(1, r.currentReservePct / r.reserveTargetPct),
          0,
        ) / reserveActive.length;
  const reserveOnTarget = data.excludedRows.filter(
    (r) => r.status === "at_target" || r.status === "above_target",
  ).length;

  const items = [
    {
      label: "TOTAL",
      value: fmtCAD(data.totalValueCAD),
      hint: "PORTFOLIO VALUE (CAD)",
      title: "Sum of all holdings × latest price, USD converted to CAD via FX rate.",
    },
    {
      label: "WEEKLY",
      value: fmtCAD(data.contributionCAD),
      hint:
        data.contributionCurrency === "USD"
          ? `${data.contributionAmount.toFixed(2)} USD · ${data.contributionFrequency.toUpperCase()}`
          : data.contributionFrequency.toUpperCase(),
      title: "This period's contribution amount, in CAD.",
    },
    {
      label: "USD/CAD",
      value: data.fxRate.toFixed(4),
      hint: data.fxFallback ? "FALLBACK RATE" : "LIVE",
      warn: data.fxFallback,
      title: "USD→CAD exchange rate from Yahoo Finance.",
    },
    {
      label: "RESERVE",
      value: reserveProgress == null ? "—" : fmtPct(reserveProgress * 100, 0),
      hint:
        data.excludedRows.length === 0
          ? "NO EXCLUDED TICKERS"
          : `${reserveOnTarget}/${data.excludedRows.length} ON TARGET`,
      title:
        "Average progress of excluded (reserve) tickers toward their reserve target % of total portfolio. 100% = all reserve tickers at target.",
    },
    {
      label: "AVG DRIFT",
      value: fmtSignedPct(avgDrift, 1),
      hint: "NORMAL TARGETS",
      title:
        "Average absolute deviation between current % and target % across all normal tickers. Lower is closer to your target allocation.",
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-2 divide-y divide-border sm:grid-cols-3 sm:divide-y-0 sm:divide-x lg:grid-cols-5">
        {items.map((it, i) => (
          <div
            key={it.label}
            title={it.title}
            className={`px-4 py-3 ${
              i % 2 === 1 ? "border-l border-border sm:border-l-0" : ""
            } ${i >= 3 ? "sm:border-t sm:border-border lg:border-t-0" : ""} ${
              it.warn ? "bg-accent/5" : ""
            }`}
          >
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {it.label}
            </div>
            <div className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">
              {it.value}
            </div>
            {it.hint ? (
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {it.hint}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

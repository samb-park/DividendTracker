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
      label: "Total",
      value: fmtCAD(data.totalValueCAD),
      hint: "Portfolio value (CAD)",
      title: "Sum of all holdings × latest price, USD converted to CAD via FX rate.",
    },
    {
      label: "Weekly",
      value: fmtCAD(data.contributionCAD),
      hint:
        data.contributionCurrency === "USD"
          ? `${data.contributionAmount.toFixed(2)} USD · ${data.contributionFrequency}`
          : data.contributionFrequency,
      title: "This period's contribution amount, in CAD.",
    },
    {
      label: "USD/CAD",
      value: data.fxRate.toFixed(4),
      hint: data.fxFallback ? "Fallback rate" : "Live",
      warn: data.fxFallback,
      title: "USD→CAD exchange rate from Yahoo Finance.",
    },
    {
      label: "Reserve",
      value: reserveProgress == null ? "—" : fmtPct(reserveProgress * 100, 0),
      hint:
        data.excludedRows.length === 0
          ? "No excluded tickers"
          : `${reserveOnTarget}/${data.excludedRows.length} on target`,
      title:
        "Average progress of excluded (reserve) tickers toward their reserve target % of total portfolio. 100% = all reserve tickers at target.",
    },
    {
      label: "Avg Drift",
      value: fmtSignedPct(avgDrift, 1),
      hint: "Normal targets",
      title:
        "Average absolute deviation between current % and target % across all normal tickers. Lower is closer to your target allocation.",
    },
  ];

  return (
    <div className="v2-card overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it, i) => (
          <div
            key={it.label}
            title={it.title}
            className="px-5 py-4"
            style={{
              borderLeft:
                i === 0 ? "none" : "1px solid hsl(var(--v2-divider-soft))",
              borderTop:
                i < 3 ? "none" : "1px solid hsl(var(--v2-divider-soft))",
            }}
          >
            <div className="v2-fineprint" style={{ fontSize: 11, marginBottom: 6 }}>
              {it.label}
            </div>
            <div
              className="v2-tnum"
              style={{
                fontFamily:
                  "'SF Pro Display', system-ui, -apple-system, Inter, sans-serif",
                fontSize: 22,
                fontWeight: 600,
                lineHeight: 1.15,
                letterSpacing: "-0.32px",
                color: "hsl(var(--v2-ink-strong))",
              }}
            >
              {it.value}
            </div>
            {it.hint ? (
              <div
                className="v2-fineprint mt-1"
                style={{ color: it.warn ? "hsl(36 90% 38%)" : undefined }}
              >
                {it.hint}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Stack into 2-row layout on smaller screens with hairlines visible */}
      <style>{`
        @media (max-width: 639px) {
          .v2-root .v2-card .grid > div:nth-child(2n) {
            border-left: 1px solid hsl(var(--v2-divider-soft)) !important;
          }
          .v2-root .v2-card .grid > div:nth-child(odd):not(:first-child) {
            border-top: 1px solid hsl(var(--v2-divider-soft)) !important;
          }
          .v2-root .v2-card .grid > div:nth-child(even) {
            border-top: 1px solid hsl(var(--v2-divider-soft)) !important;
          }
        }
      `}</style>
    </div>
  );
}

"use client";

import { fmtCAD, fmtSignedPct } from "./format";
import type { V2AllocationData } from "@/lib/v2-data";

export function V2SummaryCards({ data }: { data: V2AllocationData }) {
  const totalDriftAbs = data.normalRows.reduce(
    (s, r) => s + Math.abs(r.driftPct),
    0,
  );
  const avgDrift = data.normalRows.length > 0 ? totalDriftAbs / data.normalRows.length : 0;

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
      label: "Avg Drift",
      value: fmtSignedPct(avgDrift, 1),
      hint: "Normal targets",
      title:
        "Average absolute deviation between current % and target % across all normal tickers. Lower is closer to your target allocation.",
    },
  ];

  return (
    <div className="v2-card overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {items.map((it, i) => (
          <div
            key={it.label}
            title={it.title}
            className="px-5 py-4"
            style={{
              borderLeft:
                i === 0 ? "none" : "1px solid hsl(var(--v2-divider-soft))",
              borderTop:
                i < 2 ? "none" : "1px solid hsl(var(--v2-divider-soft))",
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
                fontSize: 17,
                fontWeight: 600,
                lineHeight: 1.24,
                letterSpacing: "-0.374px",
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

      <style>{`
        @media (max-width: 639px) {
          .v2-root .v2-card .grid > div:nth-child(2n) {
            border-left: 1px solid hsl(var(--v2-divider-soft)) !important;
          }
          .v2-root .v2-card .grid > div:nth-child(odd):not(:first-child) {
            border-top: 1px solid hsl(var(--v2-divider-soft)) !important;
          }
          .v2-root .v2-card .grid > div:nth-child(even):not(:nth-child(2)) {
            border-top: 1px solid hsl(var(--v2-divider-soft)) !important;
          }
        }
      `}</style>
    </div>
  );
}

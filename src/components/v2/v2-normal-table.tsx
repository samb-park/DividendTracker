"use client";

import type { V2NormalRow } from "@/lib/v2-allocation";
import { fmtCAD, fmtPct, fmtShares } from "./format";

export function V2NormalTable({ rows }: { rows: V2NormalRow[] }) {
  if (rows.length === 0) {
    return <Empty>No normal target tickers configured.</Empty>;
  }
  const sorted = [...rows].sort((a, b) => b.valueCAD - a.valueCAD);
  return (
    <div className="v2-card overflow-hidden">
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="v2-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th className="num">Shares</th>
              <th className="num">Price</th>
              <th className="num">Value</th>
              <th className="num">Current</th>
              <th className="num">Target</th>
              <th className="num">Buy</th>
              <th className="num">Post</th>
              <th className="num">Drift</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.ticker}>
                <td>
                  <div className="v2-body-strong">
                    {r.ticker}
                    {r.missingPrice ? <NoPrice /> : null}
                  </div>
                </td>
                <td className="num v2-tnum">{fmtShares(r.shares)}</td>
                <td className="num v2-tnum">
                  {r.priceLocal == null ? "—" : `${r.priceLocal.toFixed(2)} ${r.currency}`}
                </td>
                <td className="num v2-tnum">{fmtCAD(r.valueCAD)}</td>
                <td className="num v2-tnum">{fmtPct(r.currentPctOfNormal)}</td>
                <td className="num v2-tnum">
                  {fmtPct(r.normalizedTargetPct)}
                  {Math.abs(r.normalizedTargetPct - r.rawTargetPct) > 0.05 ? (
                    <div className="v2-fineprint v2-tnum">raw {r.rawTargetPct.toFixed(1)}%</div>
                  ) : null}
                </td>
                <td className="num v2-tnum">
                  {r.suggestedContributionCAD > 0 ? (
                    <span style={{ color: "hsl(var(--v2-action-blue))", fontWeight: 600 }}>
                      {fmtCAD(r.suggestedContributionCAD)}
                    </span>
                  ) : (
                    <span style={{ color: "hsl(var(--v2-ink-muted-48))" }}>—</span>
                  )}
                </td>
                <td className="num v2-tnum">{fmtPct(r.postPctOfNormal)}</td>
                <td className="num">
                  <Drift value={r.driftPct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <ul className="md:hidden">
        {sorted.map((r, i) => (
          <li
            key={r.ticker}
            className="px-5 py-4"
            style={{
              borderTop:
                i === 0 ? "none" : "1px solid hsl(var(--v2-divider-soft))",
            }}
          >
            <div className="flex items-baseline justify-between">
              <div className="v2-body-strong">
                {r.ticker}
                {r.missingPrice ? <NoPrice /> : null}
              </div>
              <div className="v2-tnum" style={{ fontSize: 17, fontWeight: 600 }}>
                {fmtCAD(r.valueCAD)}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <Metric label="Current" value={fmtPct(r.currentPctOfNormal)} />
              <Metric label="Target" value={fmtPct(r.normalizedTargetPct)} />
              <Metric label="Drift" value={<Drift value={r.driftPct} />} />
            </div>
            {r.suggestedContributionCAD > 0 ? (
              <div
                className="mt-3 flex items-center justify-between"
                style={{
                  background: "hsla(var(--v2-action-blue) / 0.08)",
                  color: "hsl(var(--v2-action-blue))",
                  borderRadius: 11,
                  padding: "8px 12px",
                  fontSize: 13,
                  letterSpacing: "-0.18px",
                }}
              >
                <span>Buy</span>
                <span className="v2-tnum" style={{ fontWeight: 600 }}>
                  {fmtCAD(r.suggestedContributionCAD)} → post {fmtPct(r.postPctOfNormal)}
                </span>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="v2-card-soft px-6 py-8 text-center">
      <p className="v2-caption">{children}</p>
    </div>
  );
}

function NoPrice() {
  return (
    <span
      className="v2-badge v2-badge-warn"
      style={{ marginLeft: 8, fontSize: 11, padding: "1px 8px" }}
    >
      no price
    </span>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="v2-fineprint">{label}</div>
      <div className="v2-tnum" style={{ fontSize: 15, fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}

function Drift({ value }: { value: number }) {
  const sign = value >= 0 ? "+" : "";
  let color = "hsl(var(--v2-ink-muted-48))";
  if (Math.abs(value) >= 0.5) {
    color = value > 0 ? "hsl(var(--v2-action-blue))" : "hsl(var(--negative))";
  }
  return (
    <span className="v2-tnum" style={{ color, fontVariantNumeric: "tabular-nums" }}>
      {sign}{value.toFixed(2)}%
    </span>
  );
}

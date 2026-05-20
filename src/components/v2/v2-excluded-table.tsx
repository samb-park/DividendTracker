"use client";

import type { V2ExcludedRow } from "@/lib/v2-allocation";
import { fmtCAD, fmtPct, fmtShares } from "./format";

export function V2ExcludedTable({ rows }: { rows: V2ExcludedRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="v2-card-soft px-6 py-8 text-center">
        <p className="v2-caption">
          No Non-Core tickers. Toggle &ldquo;excluded&rdquo; in Settings → Core to move a ticker to Non-Core.
        </p>
      </div>
    );
  }
  const sorted = [...rows].sort((a, b) => b.valueCAD - a.valueCAD);
  return (
    <div className="v2-card overflow-hidden">
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="v2-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th className="num">Shares</th>
              <th className="num">Price</th>
              <th className="num">Value</th>
              <th className="num">Current R%</th>
              <th className="num">Target R%</th>
              <th className="num">Planned</th>
              <th className="num">Actual</th>
              <th>Flow</th>
              <th className="num">Post R%</th>
              <th>Status</th>
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
                <td className="num v2-tnum">{fmtPct(r.currentReservePct)}</td>
                <td className="num v2-tnum">{fmtPct(r.reserveTargetPct)}</td>
                <td className="num v2-tnum">{fmtCAD(r.plannedWeeklyCAD)}</td>
                <td className="num v2-tnum">
                  {r.actualSuggestedCAD > 0 ? (
                    <span style={{ color: "hsl(var(--v2-action-blue))", fontWeight: 600 }}>
                      {fmtCAD(r.actualSuggestedCAD)}
                    </span>
                  ) : (
                    <span style={{ color: "hsl(var(--v2-ink-muted-48))" }}>{fmtCAD(0)}</span>
                  )}
                </td>
                <td>
                  <FlowChips row={r} />
                </td>
                <td className="num v2-tnum">{fmtPct(r.postReservePct)}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
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
              <div className="flex items-center gap-2">
                <span className="v2-body-strong">{r.ticker}</span>
                <StatusBadge status={r.status} />
              </div>
              <div className="v2-tnum" style={{ fontSize: 17, fontWeight: 600 }}>
                {fmtCAD(r.valueCAD)}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <Metric label="Current R%" value={fmtPct(r.currentReservePct)} />
              <Metric label="Target R%" value={fmtPct(r.reserveTargetPct)} />
              <Metric label="Planned" value={fmtCAD(r.plannedWeeklyCAD)} />
            </div>
            <div
              className="mt-3 flex items-center justify-between"
              style={{
                background:
                  r.actualSuggestedCAD > 0
                    ? "hsla(var(--v2-action-blue) / 0.08)"
                    : "hsl(var(--v2-canvas-parchment))",
                color:
                  r.actualSuggestedCAD > 0
                    ? "hsl(var(--v2-action-blue))"
                    : "hsl(var(--v2-ink-muted-48))",
                borderRadius: 11,
                padding: "8px 12px",
                fontSize: 13,
                letterSpacing: "-0.18px",
              }}
            >
              <span>Actual</span>
              <span className="v2-tnum" style={{ fontWeight: 600 }}>
                {fmtCAD(r.actualSuggestedCAD)} → post {fmtPct(r.postReservePct)}
              </span>
            </div>
            {(r.reservedFromTickers.length > 0 || r.reallocatedToTickers.length > 0) && (
              <div className="mt-2">
                <FlowChips row={r} />
              </div>
            )}
          </li>
        ))}
      </ul>
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

function StatusBadge({ status }: { status: V2ExcludedRow["status"] }) {
  const map: Record<V2ExcludedRow["status"], { label: string; cls: string }> = {
    below_target: { label: "Below", cls: "v2-badge-warn" },
    at_target: { label: "On target", cls: "v2-badge-blue" },
    above_target: { label: "Above", cls: "v2-badge-neutral" },
    inactive: { label: "Inactive", cls: "v2-badge-neutral" },
  };
  const s = map[status];
  return <span className={`v2-badge ${s.cls}`}>{s.label}</span>;
}

function FlowChips({ row }: { row: V2ExcludedRow }) {
  if (row.reservedFromTickers.length === 0 && row.reallocatedToTickers.length === 0) {
    return <span className="v2-fineprint">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {row.reservedFromTickers.map((t) => (
        <span key={`from-${t}`} className="v2-badge v2-badge-blue">
          ← {t}
        </span>
      ))}
      {row.reallocatedToTickers.map((t) => (
        <span key={`to-${t}`} className="v2-badge v2-badge-neutral">
          → {t}
        </span>
      ))}
    </div>
  );
}

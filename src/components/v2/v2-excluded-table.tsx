"use client";

import type { V2ExcludedRow } from "@/lib/v2-allocation";
import { fmtCAD, fmtPct, fmtShares } from "./format";

export function V2ExcludedTable({ rows }: { rows: V2ExcludedRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        No reserve / excluded tickers. Add them via Settings → Targets.
      </div>
    );
  }
  const sorted = [...rows].sort((a, b) => b.valueCAD - a.valueCAD);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th align="left">Ticker</Th>
              <Th>Shares</Th>
              <Th>Price</Th>
              <Th>Value</Th>
              <Th>Cur R%</Th>
              <Th>Tgt R%</Th>
              <Th>Planned</Th>
              <Th>Actual</Th>
              <Th align="left">Flow</Th>
              <Th>Post R%</Th>
              <Th align="left">Status</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.ticker} className="border-t border-border last:border-b-0 hover:bg-muted/20">
                <Td align="left" className="font-medium">
                  {r.ticker}
                  {r.missingPrice ? (
                    <span className="ml-1 rounded bg-destructive/15 px-1 py-0.5 text-[9px] text-destructive">
                      no price
                    </span>
                  ) : null}
                </Td>
                <Td>{fmtShares(r.shares)}</Td>
                <Td>{r.priceLocal == null ? "—" : `${r.priceLocal.toFixed(2)} ${r.currency}`}</Td>
                <Td>{fmtCAD(r.valueCAD)}</Td>
                <Td>{fmtPct(r.currentReservePct)}</Td>
                <Td>{fmtPct(r.reserveTargetPct)}</Td>
                <Td>{fmtCAD(r.plannedWeeklyCAD)}</Td>
                <Td className={r.actualSuggestedCAD > 0 ? "text-primary" : ""}>
                  {fmtCAD(r.actualSuggestedCAD)}
                </Td>
                <Td align="left">
                  <FlowDescriptor row={r} />
                </Td>
                <Td>{fmtPct(r.postReservePct)}</Td>
                <Td align="left">
                  <StatusBadge status={r.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="divide-y divide-border md:hidden">
        {sorted.map((r) => (
          <div key={r.ticker} className="px-4 py-3">
            <div className="flex items-baseline justify-between">
              <div className="font-medium flex items-center gap-2">
                {r.ticker}
                <StatusBadge status={r.status} />
              </div>
              <div className="tabular-nums text-sm">{fmtCAD(r.valueCAD, { compact: true })}</div>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
              <Cell label="Cur R%" value={fmtPct(r.currentReservePct)} />
              <Cell label="Tgt R%" value={fmtPct(r.reserveTargetPct)} />
              <Cell label="Planned" value={fmtCAD(r.plannedWeeklyCAD, { compact: true })} />
            </div>
            <div className="mt-2 flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5 text-[11px]">
              <span className="text-muted-foreground">Actual</span>
              <span
                className={`tabular-nums ${r.actualSuggestedCAD > 0 ? "text-primary" : "text-muted-foreground"}`}
              >
                {fmtCAD(r.actualSuggestedCAD)} → post {fmtPct(r.postReservePct)}
              </span>
            </div>
            {(r.reservedFromTickers.length > 0 || r.reallocatedToTickers.length > 0) && (
              <div className="mt-1 text-[11px]">
                <FlowDescriptor row={r} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Th({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-3 py-2 ${align === "left" ? "text-left" : "text-right"} font-medium`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = "right",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 ${align === "left" ? "text-left" : "text-right"} tabular-nums ${className}`}>
      {children}
    </td>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: V2ExcludedRow["status"] }) {
  const map: Record<V2ExcludedRow["status"], { label: string; cls: string }> = {
    below_target: { label: "Below", cls: "bg-accent/15 text-accent" },
    at_target: { label: "On target", cls: "bg-primary/15 text-primary" },
    above_target: { label: "Above", cls: "bg-muted text-muted-foreground" },
    inactive: { label: "Inactive", cls: "bg-muted text-muted-foreground" },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function FlowDescriptor({ row }: { row: V2ExcludedRow }) {
  if (row.reservedFromTickers.length === 0 && row.reallocatedToTickers.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1 text-[10px]">
      {row.reservedFromTickers.map((t) => (
        <span key={`from-${t}`} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
          ← {t}
        </span>
      ))}
      {row.reallocatedToTickers.map((t) => (
        <span key={`to-${t}`} className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">
          → {t}
        </span>
      ))}
    </div>
  );
}

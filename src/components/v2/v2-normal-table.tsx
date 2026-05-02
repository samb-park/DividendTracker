"use client";

import type { V2NormalRow } from "@/lib/v2-allocation";
import { fmtCAD, fmtPct, fmtShares, fmtSignedPct } from "./format";

export function V2NormalTable({ rows }: { rows: V2NormalRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        No normal target tickers configured.
      </div>
    );
  }
  const sorted = [...rows].sort((a, b) => b.valueCAD - a.valueCAD);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <Th align="left">Ticker</Th>
              <Th>Shares</Th>
              <Th>Price</Th>
              <Th>Value (CAD)</Th>
              <Th>Cur %</Th>
              <Th>Target %</Th>
              <Th>Buy</Th>
              <Th>Post Val</Th>
              <Th>Post %</Th>
              <Th>Drift</Th>
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
                <Td>
                  {r.priceLocal == null ? "—" : `${r.priceLocal.toFixed(2)} ${r.currency}`}
                </Td>
                <Td>{fmtCAD(r.valueCAD)}</Td>
                <Td>{fmtPct(r.currentPctOfNormal)}</Td>
                <Td>
                  <div className="tabular-nums">
                    {fmtPct(r.normalizedTargetPct)}
                  </div>
                  {Math.abs(r.normalizedTargetPct - r.rawTargetPct) > 0.05 ? (
                    <div className="text-[10px] text-muted-foreground">raw {r.rawTargetPct.toFixed(1)}%</div>
                  ) : null}
                </Td>
                <Td className={r.suggestedContributionCAD > 0 ? "text-primary" : ""}>
                  {r.suggestedContributionCAD > 0 ? fmtCAD(r.suggestedContributionCAD) : "—"}
                </Td>
                <Td>{fmtCAD(r.postValueCAD)}</Td>
                <Td>{fmtPct(r.postPctOfNormal)}</Td>
                <Td>
                  <DriftPill value={r.driftPct} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="divide-y divide-border md:hidden">
        {sorted.map((r) => (
          <div key={r.ticker} className="px-4 py-3">
            <div className="flex items-baseline justify-between">
              <div className="font-medium">
                {r.ticker}
                {r.missingPrice ? (
                  <span className="ml-1 rounded bg-destructive/15 px-1 py-0.5 text-[9px] text-destructive">
                    no price
                  </span>
                ) : null}
              </div>
              <div className="tabular-nums text-sm">{fmtCAD(r.valueCAD, { compact: true })}</div>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
              <Cell label="Cur" value={fmtPct(r.currentPctOfNormal)} />
              <Cell label="Tgt" value={fmtPct(r.normalizedTargetPct)} />
              <Cell label="Drift" value={<DriftPill value={r.driftPct} />} />
            </div>
            {r.suggestedContributionCAD > 0 ? (
              <div className="mt-2 flex items-center justify-between rounded-md bg-primary/10 px-2 py-1.5 text-[11px]">
                <span className="text-muted-foreground">Buy</span>
                <span className="text-primary tabular-nums">
                  {fmtCAD(r.suggestedContributionCAD)} → post {fmtPct(r.postPctOfNormal)}
                </span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Th({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`px-3 py-2 ${align === "left" ? "text-left" : "text-right"} font-medium`}
    >
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
    <td
      className={`px-3 py-2 ${align === "left" ? "text-left" : "text-right"} tabular-nums ${className}`}
    >
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

function DriftPill({ value }: { value: number }) {
  const sign = value >= 0 ? "+" : "";
  const cls =
    Math.abs(value) < 0.5
      ? "text-muted-foreground"
      : value > 0
        ? "text-accent"
        : "text-destructive";
  return <span className={`tabular-nums ${cls}`}>{sign}{value.toFixed(2)}%</span>;
}

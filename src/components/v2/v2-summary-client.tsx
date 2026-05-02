"use client";

import { useState } from "react";
import { V2SummaryCards } from "./v2-summary-cards";
import { V2NormalTable } from "./v2-normal-table";
import { V2ExcludedTable } from "./v2-excluded-table";
import { fmtCAD } from "./format";
import type { V2AllocationData } from "@/lib/v2-data";

export function V2SummaryClient({ data }: { data: V2AllocationData }) {
  const [tab, setTab] = useState<"normal" | "reserve">("normal");

  return (
    <div className="space-y-6">
      <V2SummaryCards data={data} />

      {data.warnings.length > 0 ? (
        <div className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-[11px]">
          <div className="mb-1 text-[10px] uppercase tracking-[0.18em] opacity-70">NOTICES</div>
          <ul className="space-y-0.5 text-foreground/90">
            {data.warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Desktop / tablet: stacked full-width */}
      <div className="hidden space-y-6 lg:block">
        <section>
          <SectionHeader
            title="NORMAL TARGETS"
            sub={`${data.normalRows.length} TICKERS · ${fmtCAD(data.normalGroupValueCAD)}`}
          />
          <V2NormalTable rows={data.normalRows} />
        </section>
        <section>
          <SectionHeader
            title="RESERVE / EXCLUDED"
            sub={`${data.excludedRows.length} TICKERS · ${fmtCAD(data.excludedGroupValueCAD)}`}
          />
          <V2ExcludedTable rows={data.excludedRows} />
        </section>
      </div>

      {/* Mobile: segmented switch */}
      <div className="lg:hidden">
        <div className="mb-3 flex items-center justify-between">
          <SegmentedSwitch
            value={tab}
            onChange={setTab}
            options={[
              { id: "normal", label: `NORMAL (${data.normalRows.length})` },
              { id: "reserve", label: `RESERVE (${data.excludedRows.length})` },
            ]}
          />
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
            {tab === "normal" ? fmtCAD(data.normalGroupValueCAD) : fmtCAD(data.excludedGroupValueCAD)}
          </div>
        </div>
        {tab === "normal" ? (
          <V2NormalTable rows={data.normalRows} />
        ) : (
          <V2ExcludedTable rows={data.excludedRows} />
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em]">{title}</h2>
      {sub ? (
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
          {sub}
        </span>
      ) : null}
    </div>
  );
}

function SegmentedSwitch<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-full bg-muted/50 p-0.5 text-[11px]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-full px-3 py-1 font-medium uppercase tracking-[0.15em] transition-colors ${
            value === o.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

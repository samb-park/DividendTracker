"use client";

import { useState } from "react";
import { V2SummaryCards } from "./v2-summary-cards";
import { V2NormalTable } from "./v2-normal-table";
import { V2ExcludedTable } from "./v2-excluded-table";
import type { V2AllocationData } from "@/lib/v2-data";

export function V2SummaryClient({ data }: { data: V2AllocationData }) {
  const [tab, setTab] = useState<"normal" | "reserve">("normal");

  return (
    <div className="space-y-5">
      <V2SummaryCards data={data} />

      {data.warnings.length > 0 ? (
        <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] text-accent-foreground">
          <div className="mb-1 text-[10px] uppercase tracking-widest opacity-70">Notices</div>
          <ul className="space-y-0.5 text-foreground/90">
            {data.warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Desktop: side by side */}
      <div className="hidden gap-5 lg:grid lg:grid-cols-2">
        <section>
          <SectionHeader
            title="Normal Targets"
            sub={`${data.normalRows.length} tickers · ${formatCAD(data.normalGroupValueCAD)}`}
          />
          <V2NormalTable rows={data.normalRows} />
        </section>
        <section>
          <SectionHeader
            title="Reserve / Excluded"
            sub={`${data.excludedRows.length} tickers · ${formatCAD(data.excludedGroupValueCAD)}`}
          />
          <V2ExcludedTable rows={data.excludedRows} />
        </section>
      </div>

      {/* Mobile + tablet: segmented control */}
      <div className="lg:hidden">
        <div className="mb-3 flex items-center justify-between">
          <SegmentedSwitch
            value={tab}
            onChange={setTab}
            options={[
              { id: "normal", label: `Normal (${data.normalRows.length})` },
              { id: "reserve", label: `Reserve (${data.excludedRows.length})` },
            ]}
          />
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground tabular-nums">
            {tab === "normal"
              ? formatCAD(data.normalGroupValueCAD, true)
              : formatCAD(data.excludedGroupValueCAD, true)}
          </div>
        </div>
        {tab === "normal" ? (
          <V2NormalTable rows={data.normalRows} />
        ) : (
          <V2ExcludedTable rows={data.excludedRows} />
        )}
      </div>

      <footer className="pt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        Last computed {new Date(data.lastComputedAt).toLocaleString()} · contribution{" "}
        {data.contributionFrequency} · redistribution {data.redistribution.rule}
      </footer>
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {sub ? <span className="text-[11px] text-muted-foreground tabular-nums">{sub}</span> : null}
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
    <div className="inline-flex rounded-full bg-muted/50 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-full px-3 py-1 transition-colors ${
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

function formatCAD(n: number, compact = false) {
  if (compact && Math.abs(n) >= 10000) {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}

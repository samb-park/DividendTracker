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
    <div className="space-y-7">
      <V2SummaryCards data={data} />

      {data.warnings.length > 0 ? (
        <aside
          className="v2-card-soft p-4"
          style={{ background: "hsl(36 95% 96%)", borderColor: "hsl(36 80% 85%)" }}
        >
          <div className="v2-tagline" style={{ marginBottom: 4 }}>
            Notices
          </div>
          <ul className="space-y-1 text-[14px]" style={{ color: "hsl(36 90% 28%)" }}>
            {data.warnings.map((w, i) => (
              <li key={i}>· {w}</li>
            ))}
          </ul>
        </aside>
      ) : null}

      {/* Desktop / tablet: stacked full-width */}
      <div className="hidden space-y-7 lg:block">
        <Section
          title="Holdings"
          sub={`${data.normalRows.length} tickers · ${fmtCAD(data.normalGroupValueCAD)}`}
        >
          <V2NormalTable rows={data.normalRows} />
        </Section>
        <Section
          title="Reserves"
          sub={`${data.excludedRows.length} tickers · ${fmtCAD(data.excludedGroupValueCAD)}`}
        >
          <V2ExcludedTable rows={data.excludedRows} />
        </Section>
      </div>

      {/* Mobile / tablet portrait: segmented switch */}
      <div className="space-y-3 lg:hidden">
        <div className="flex items-center justify-between">
          <div className="v2-segmented">
            <button type="button" data-active={tab === "normal"} onClick={() => setTab("normal")}>
              Holdings · {data.normalRows.length}
            </button>
            <button type="button" data-active={tab === "reserve"} onClick={() => setTab("reserve")}>
              Reserves · {data.excludedRows.length}
            </button>
          </div>
          <span className="v2-fineprint v2-tnum">
            {tab === "normal" ? fmtCAD(data.normalGroupValueCAD) : fmtCAD(data.excludedGroupValueCAD)}
          </span>
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

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="v2-display v2-display-md" style={{ color: "hsl(var(--v2-ink-strong))" }}>
          {title}
        </h2>
        {sub ? <span className="v2-fineprint v2-tnum">{sub}</span> : null}
      </div>
      {children}
    </section>
  );
}

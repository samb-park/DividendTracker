"use client";

import { ALLOCATION_COLORS } from "@/lib/chart-tokens";

export interface DonutSlice {
  label: string;
  value: number; // > 0; same unit as the others on the page (USD/yr)
}

interface FoldedSlice extends DonutSlice {
  color: string;
}

/** Muted gray for the folded "Other" slice — never one of the ranked colors. */
const OTHER_COLOR = "hsl(220, 9%, 55%)";

/** Whole-dollar USD (no cents) — distribution figures don't need cent precision. */
const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Percent of total — a positive-but-sub-1% slice shows "<1%" instead of a misleading "0%". */
const pct = (f: number) => {
  const p = f * 100;
  return p > 0 && Math.round(p) < 1 ? "<1%" : `${Math.round(p)}%`;
};

/**
 * Fold a slice list to the top N + a single "Other" so the ring/legend stay
 * readable (the SIMPLE lever). Positive values only; colored by descending rank
 * (NOT a hash — avoids adjacent-arc collisions). Never folds a lone tail into an
 * "Other (1)". Returns [] when nothing is positive.
 */
export function foldTopN(slices: DonutSlice[], n = 6): FoldedSlice[] {
  const sorted = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= n + 1) {
    return sorted.map((s, i) => ({ ...s, color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }));
  }
  const top = sorted.slice(0, n).map((s, i) => ({ ...s, color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }));
  const rest = sorted.slice(n);
  const otherVal = rest.reduce((s, x) => s + x.value, 0);
  return [...top, { label: `Other (${rest.length})`, value: otherVal, color: OTHER_COLOR }];
}

/**
 * Hand-rolled SVG donut. Each slice is its own <circle> with a single-dash
 * stroke-dasharray, rotated to start where the prior slice ended (clockwise from
 * 12 o'clock). The center total is an HTML overlay (not SVG text) so it reuses the
 * money formatter and scales cleanly. A faint full-circle track sits behind.
 */
export function PocketDonut({
  slices,
  centerValue,
  centerLabel,
  caption,
  emptyText = "No dividend data yet",
}: {
  slices: DonutSlice[];
  centerValue?: string; // override; defaults to the summed total
  centerLabel?: string; // e.g. "per year"
  caption?: string;
  emptyText?: string;
}) {
  const folded = foldTopN(slices);
  const sum = folded.reduce((s, x) => s + x.value, 0);

  if (!folded.length || sum <= 0) {
    return (
      <div className="pk-donut-empty">
        <p className="pk-note">{emptyText}</p>
      </div>
    );
  }

  const size = 200;
  const r = 78;
  const sw = 26;
  const c = size / 2;
  const C = 2 * Math.PI * r;

  let acc = 0; // cumulative fraction
  const arcs = folded.map((s) => {
    const f = s.value / sum;
    const rot = acc * 360 - 90; // start slice 0 at 12 o'clock, each after the last
    acc += f;
    return { color: s.color, dash: f * C, rot };
  });

  return (
    <div className="pk-donut-page">
      <div className="pk-donut-ring">
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Dividend distribution">
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--pk-hairline)" strokeWidth={sw} />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={sw}
              strokeDasharray={`${a.dash} ${C}`}
              transform={`rotate(${a.rot} ${c} ${c})`}
            />
          ))}
        </svg>
        <div className="pk-donut-center">
          <span className="pk-donut-value">{centerValue ?? usd0(sum)}</span>
          {centerLabel && <span className="pk-donut-label">{centerLabel}</span>}
        </div>
      </div>
      {caption && <p className="pk-donut-caption">{caption}</p>}
      <div className="pk-legend">
        {folded.map((s, i) => (
          <div className="pk-legend-row" key={i}>
            <span className="pk-legend-dot" style={{ background: s.color }} />
            <span className="pk-legend-label">{s.label}</span>
            <span className="pk-legend-val">{usd0(s.value)}</span>
            <span className="pk-legend-pct">{pct(s.value / sum)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

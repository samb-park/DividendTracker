"use client";

export interface DonutSlice {
  label: string;
  value: number; // > 0; same unit as the others on the page (USD/yr)
}

interface FoldedSlice extends DonutSlice {
  color: string;
}

/** MDD terminal series palette (mirrors MDD's seriesColors) — cyan/orange-led so
    the donut matches the rest of the re-skinned surface. Kept local to /pocket so
    the shared chart-tokens (used by other app surfaces) stay untouched. */
const MDD_SERIES = [
  "#00e5ff", // cyan
  "#ff8c1a", // orange
  "#5b8def", // info blue
  "#00d26a", // green
  "#b18cff", // violet
  "#ffd60a", // yellow
  "#ff6ec7", // pink
  "#7ee8a2", // mint
] as const;

/** text-low gray for the folded "Other" slice — never one of the ranked colors. */
const OTHER_COLOR = "#525e6d";

/** Whole-dollar USD (no cents) — distribution figures don't need cent precision. */
const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Integer percents for a fraction list (must sum to ≤1 each, ~1 total) that sum
 * to exactly 100 — largest-remainder method. Independent per-slice rounding can
 * total 99 or 101; here each slice gets its floor, then the leftover points go
 * to the slices with the largest fractional remainders.
 */
export function roundPercentsTo100(fractions: number[]): number[] {
  const raw = fractions.map((f) => f * 100);
  const out = raw.map(Math.floor);
  let leftover = 100 - out.reduce((a, b) => a + b, 0);
  const byRemainder = raw
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem);
  for (let k = 0; k < byRemainder.length && leftover > 0; k++, leftover--) {
    out[byRemainder[k].i]++;
  }
  return out;
}

/** A positive-but-rounded-to-0 slice shows "<1%" instead of a misleading "0%". */
const pctLabel = (p: number, value: number) => (value > 0 && p < 1 ? "<1%" : `${p}%`);

/**
 * Fold a slice list to the top N + a single "Other" so the ring/legend stay
 * readable (the SIMPLE lever). Positive values only; colored by descending rank
 * (NOT a hash — avoids adjacent-arc collisions). Never folds a lone tail into an
 * "Other (1)". Returns [] when nothing is positive.
 */
export function foldTopN(slices: DonutSlice[], n = 6): FoldedSlice[] {
  const sorted = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= n + 1) {
    return sorted.map((s, i) => ({ ...s, color: MDD_SERIES[i % MDD_SERIES.length] }));
  }
  const top = sorted.slice(0, n).map((s, i) => ({ ...s, color: MDD_SERIES[i % MDD_SERIES.length] }));
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

  const pcts = roundPercentsTo100(folded.map((s) => s.value / sum));

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
            <span className="pk-legend-pct">{pctLabel(pcts[i], s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

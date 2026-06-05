"use client";

import { useLayoutEffect, useRef } from "react";

const ROWS = [
  { key: "D", div: 365 },
  { key: "W", div: 52 },
  { key: "M", div: 12 },
  { key: "Y", div: 1 },
] as const;

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

interface Props {
  annualUSD: number;
  totalValueUSD: number;
  avgYieldPct: number;
  loading: boolean;
  error: boolean;
  isEmpty: boolean; // user holds nothing
  allExcluded: boolean; // holdings exist but none selected
  priceGap: boolean; // a selected ticker is missing a live price
  freqGuess: boolean; // a selected ticker's payment frequency was guessed (<2 records)
  fxFallback: boolean; // FX rate is a stale/default fallback
  onRetry: () => void;
}

// Cap-height-to-digit-height ratio of the actual rendered font, so the gray
// letters read at the SAME visual height as the digits. Measured at runtime
// (fonts vary) instead of a guessed constant.
function measureLabelRatio(el: HTMLElement): number {
  try {
    const cs = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return 1;
    ctx.font = `${cs.fontWeight} 200px ${cs.fontFamily}`;
    const cap = ctx.measureText("M");
    const dig = ctx.measureText("0");
    const capH = cap.actualBoundingBoxAscent + cap.actualBoundingBoxDescent;
    const digH = dig.actualBoundingBoxAscent + dig.actualBoundingBoxDescent;
    if (capH > 0 && digH > 0) return Math.min(1.4, Math.max(0.95, digH / capH));
  } catch {
    /* fall through */
  }
  return 1;
}

export function PocketHero({
  annualUSD,
  totalValueUSD,
  avgYieldPct,
  loading,
  error,
  isEmpty,
  allExcluded,
  priceGap,
  freqGuess,
  fxFallback,
  onRetry,
}: Props) {
  const colRef = useRef<HTMLDivElement>(null);

  // Auto-fit the hero numbers to the available width so 5-6 digit real
  // portfolios never overflow. All four share one size, driven by the widest
  // row. Imperative font-size — no re-render loop.
  useLayoutEffect(() => {
    const col = colRef.current;
    if (!col) return;
    const fit = () => {
      const nums = Array.from(col.querySelectorAll<HTMLElement>("[data-hero-num]"));
      const labels = Array.from(col.querySelectorAll<HTMLElement>("[data-hero-label]"));
      if (!nums.length) return;
      const MAX = 58;
      const MIN = 26;
      const ratio = measureLabelRatio(nums[0]);
      nums.forEach((n) => (n.style.fontSize = `${MAX}px`));
      labels.forEach((l) => (l.style.fontSize = `${Math.round(MAX * ratio)}px`));
      let scale = 1;
      nums.forEach((n) => {
        const avail = n.clientWidth;
        const content = n.scrollWidth;
        if (content > avail && content > 0) scale = Math.min(scale, avail / content);
      });
      const final = Math.max(MIN, Math.min(MAX, Math.floor(MAX * scale)));
      nums.forEach((n) => (n.style.fontSize = `${final}px`));
      labels.forEach((l) => (l.style.fontSize = `${Math.round(final * ratio)}px`));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(col);
    return () => ro.disconnect();
  }, [annualUSD, loading, isEmpty, allExcluded]);

  const showZero = !loading && (isEmpty || allExcluded);
  const showData = !error && !loading && !isEmpty && !allExcluded;

  const numText = (div: number) => {
    if (loading) return "—";
    if (showZero) return money(0);
    return money(annualUSD / div);
  };

  return (
    <>
      <div className="pk-topbar">
        <h1 className="pk-title">Dividends</h1>
      </div>

      <div className="pk-summary">
        <div className="pk-summary-cell">
          <span className="pk-summary-label">AVG</span>
          <span className="pk-summary-value">{loading ? "—" : `${money(showZero ? 0 : avgYieldPct)}%`}</span>
        </div>
        <div className="pk-summary-cell right">
          <span className="pk-summary-label">USD</span>
          <span className="pk-summary-value">{loading ? "—" : money(showZero ? 0 : totalValueUSD)}</span>
        </div>
      </div>

      <div className="pk-spacer-top" />

      <div className="pk-hero" ref={colRef}>
        {ROWS.map((row) => (
          <div className="pk-row" key={row.key}>
            <span className="pk-row-label" data-hero-label>
              {row.key}
            </span>
            <span className={`pk-row-num${loading ? " pk-skeleton" : ""}`} data-hero-num>
              {numText(row.div)}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div>
          <p className="pk-note warn">Couldn’t load data.</p>
          <button type="button" className="pk-retry" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {!error && isEmpty && !loading && <p className="pk-note">No holdings yet.</p>}
      {!error && !isEmpty && allExcluded && !loading && (
        <p className="pk-note">Nothing selected — choose holdings in Settings → Edit.</p>
      )}
      {showData && priceGap && (
        <p className="pk-note warn">Some holdings have no live price and were excluded from the total.</p>
      )}
      {showData && freqGuess && (
        <p className="pk-note warn">Some holdings have limited history — frequency is estimated (annual may be off).</p>
      )}
      {showData && fxFallback && <p className="pk-note warn">FX rate unavailable — using a default rate.</p>}

      <div className="pk-spacer-bottom" />
    </>
  );
}

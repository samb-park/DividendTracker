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
// Explicit stack (matches .pocket-root) so canvas measures the real SF Pro on
// iOS rather than silently falling back to the default font on a parse miss.
const HERO_FONT = '800 200px -apple-system, "SF Pro Display", system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function measureLabelRatio(): number {
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return 1;
    ctx.font = HERO_FONT;
    const capM = ctx.measureText("M");
    const digM = ctx.measureText("0");
    const capH = capM.actualBoundingBoxAscent + capM.actualBoundingBoxDescent;
    const digH = digM.actualBoundingBoxAscent + digM.actualBoundingBoxDescent;
    if (capH > 0 && digH > 0) return Math.min(1.45, Math.max(0.95, digH / capH));
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
      const ratio = measureLabelRatio();
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
    return money(showZero ? 0 : annualUSD / div); // bare figure — no $ on the big run-rate numbers (per /pocket request)
  };

  return (
    <>
      {/* The "Dividends" title + portfolio name are a FIXED header in PocketShell;
          only the summary + hero live here and slide per portfolio. */}
      <div className="pk-summary">
        <div className="pk-summary-cell">
          <span className="pk-summary-label">YIELD</span>
          <span className="pk-summary-value">{loading ? "—" : `${money(showZero ? 0 : avgYieldPct)}%`}</span>
        </div>
        <div className="pk-summary-cell right">
          <span className="pk-summary-label">VALUE</span>
          <span className="pk-summary-value">{loading ? "—" : `$${money(showZero ? 0 : totalValueUSD)}`}</span>
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

      {/* The big numbers are an AVERAGE run-rate (annual ÷ 365/52/12/1), not actual
          receipts — say so once so "M" isn't misread as this month's real income. */}
      {showData && <p className="pk-note">Average at your current dividend rate</p>}

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
        <p className="pk-note">Nothing to show — check the portfolio in Settings.</p>
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

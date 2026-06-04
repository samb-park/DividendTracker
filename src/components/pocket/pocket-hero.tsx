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
  fxFallback: boolean; // FX rate is a stale/default fallback
  onEdit: () => void;
  onRetry: () => void;
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
  fxFallback,
  onEdit,
  onRetry,
}: Props) {
  const colRef = useRef<HTMLDivElement>(null);

  // Auto-fit the hero numbers to the available width so 5-6 digit real
  // portfolios (e.g. "248,392.00") never overflow. All four share one size,
  // driven by the widest row. Imperative font-size — no re-render loop.
  useLayoutEffect(() => {
    const col = colRef.current;
    if (!col) return;
    const fit = () => {
      const nums = Array.from(col.querySelectorAll<HTMLElement>("[data-hero-num]"));
      const labels = Array.from(col.querySelectorAll<HTMLElement>("[data-hero-label]"));
      if (!nums.length) return;
      // Reference-matched comfortable size; shrink ONLY if a long number would
      // overflow the available width. Labels share the number size.
      const MAX = 58;
      const MIN = 26;
      nums.forEach((n) => (n.style.fontSize = `${MAX}px`));
      labels.forEach((l) => (l.style.fontSize = `${MAX}px`));
      let scale = 1;
      nums.forEach((n) => {
        const avail = n.clientWidth;
        const content = n.scrollWidth;
        if (content > avail && content > 0) scale = Math.min(scale, avail / content);
      });
      const final = Math.max(MIN, Math.min(MAX, Math.floor(MAX * scale)));
      nums.forEach((n) => (n.style.fontSize = `${final}px`));
      labels.forEach((l) => (l.style.fontSize = `${final}px`));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(col);
    return () => ro.disconnect();
  }, [annualUSD, loading, isEmpty, allExcluded]);

  const showZero = !loading && (isEmpty || allExcluded);

  const numText = (div: number) => {
    if (loading) return "—";
    if (showZero) return money(0);
    return money(annualUSD / div);
  };

  return (
    <>
      <div className="pk-topbar">
        <h1 className="pk-title">Dividends</h1>
        <button type="button" className="pk-edit" onClick={onEdit} disabled={loading}>
          Edit
        </button>
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
          <p className="pk-note warn">데이터를 불러오지 못했습니다.</p>
          <button type="button" className="pk-retry" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      )}
      {!error && isEmpty && !loading && <p className="pk-note">보유 중인 종목이 없습니다.</p>}
      {!error && !isEmpty && allExcluded && !loading && (
        <p className="pk-note">표시할 종목이 없습니다 — Edit에서 선택하세요.</p>
      )}
      {!error && !loading && !isEmpty && !allExcluded && priceGap && (
        <p className="pk-note warn">일부 종목의 시세를 불러오지 못해 합계에서 제외했습니다.</p>
      )}
      {!error && !loading && !isEmpty && !allExcluded && !priceGap && fxFallback && (
        <p className="pk-note warn">환율을 불러오지 못해 기본 환율을 적용했습니다.</p>
      )}

      <div className="pk-spacer-bottom" />
    </>
  );
}

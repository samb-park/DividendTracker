"use client";

import type { TickerAgg, Basis } from "@/lib/pocket-types";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

interface Props {
  tickers: TickerAgg[];
  excluded: Set<string>;
  basis: Basis;
  onToggle: (ticker: string) => void;
}

export function TickerPicker({ tickers, excluded, basis, onToggle }: Props) {
  if (tickers.length === 0) {
    return <p className="pk-note">No holdings in the selected accounts.</p>;
  }

  return (
    <div className="pk-picker">
      {tickers.map((t) => {
        const off = excluded.has(t.ticker);
        const annual = basis === "net" ? t.netAnnualUSD : t.grossAnnualUSD;
        const sub = t.priceUnavailable
          ? "No live price"
          : !t.hasDividendData
            ? `${t.name} · No dividend data`
            : t.lowConfidence
              ? `${t.name} · Est. frequency`
              : t.name;
        return (
          <div
            className="pk-picker-row"
            key={t.ticker}
            onClick={() => onToggle(t.ticker)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle(t.ticker);
              }
            }}
          >
            <div className="pk-picker-main">
              <span className={`pk-picker-ticker${off ? " off" : ""}`}>{t.ticker}</span>
              <span className="pk-picker-sub">{sub}</span>
            </div>
            <span className={`pk-picker-amt${off ? " off" : ""}`}>
              {t.priceUnavailable && !t.hasDividendData ? "—" : `$${money(annual)}/yr`}
            </span>
            <span className="pk-check" data-on={!off} aria-hidden>
              {off ? "" : "✓"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

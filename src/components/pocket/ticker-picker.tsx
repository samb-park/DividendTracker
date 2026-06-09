"use client";

import type { TickerAgg, Basis } from "@/lib/pocket-types";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

interface Props {
  tickers: TickerAgg[];
  selected: Set<string>; // tickers included in the group being edited
  basis: Basis;
  onToggle: (ticker: string) => void;
}

export function TickerPicker({ tickers, selected, basis, onToggle }: Props) {
  if (tickers.length === 0) {
    return <p className="pk-note">No holdings to choose from.</p>;
  }

  return (
    <div className="pk-picker pk-card">
      {tickers.map((t) => {
        const on = selected.has(t.ticker);
        const annual = basis === "net" ? t.netAnnualUSD : t.grossAnnualUSD;
        // Ticker-only rows (company name dropped). Keep ONLY a short caveat so the
        // app still surfaces data gaps honestly without re-introducing the name.
        const warn = t.priceUnavailable
          ? "No live price"
          : !t.hasDividendData
            ? "No dividend data"
            : t.lowConfidence
              ? "Est. frequency"
              : null;
        return (
          <div
            className="pk-picker-row"
            key={t.ticker}
            onClick={() => onToggle(t.ticker)}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle(t.ticker);
              }
            }}
          >
            <div className="pk-picker-main">
              <span className={`pk-picker-ticker${on ? "" : " off"}`}>{t.ticker}</span>
              {warn && <span className="pk-picker-sub">{warn}</span>}
            </div>
            <span className={`pk-picker-amt${on ? "" : " off"}`}>
              {t.priceUnavailable && !t.hasDividendData ? "—" : `$${money(annual)}/yr`}
            </span>
            <span className="pk-check" data-on={on} aria-hidden>
              {on ? "✓" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

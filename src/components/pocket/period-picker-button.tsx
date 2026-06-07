"use client";

import { forwardRef } from "react";

/**
 * Tappable "2026 · Jun ▾" that opens the PeriodPicker sheet (set the year + period
 * directly, the same way the portfolio name opens the PortfolioPicker). The PERIOD
 * span takes a forwarded ref so the history views can imperatively live-update it
 * during a period swipe (the year doesn't change on swipe). Mirrors
 * PortfolioPickerButton.
 */
export const PeriodPickerButton = forwardRef<
  HTMLSpanElement,
  { year: number | null; periodLabel: string; onOpen: () => void }
>(function PeriodPickerButton({ year, periodLabel, onOpen }, ref) {
  return (
    <button
      type="button"
      className="pk-pf-pick pk-period-pick"
      onClick={onOpen}
      aria-label={`Period: ${year != null ? `${year} ` : ""}${periodLabel}. Tap to change.`}
    >
      <span className="pk-pf-pick-name pk-period-pick-name">
        {year != null && (
          <>
            <span className="pk-period-pick-year">{year}</span>
            <span className="pk-period-pick-sep" aria-hidden>
              ·
            </span>
          </>
        )}
        <span className="pk-period-pick-period" ref={ref}>
          {periodLabel}
        </span>
      </span>
      <span className="pk-pf-pick-caret" aria-hidden>
        ▾
      </span>
    </button>
  );
});

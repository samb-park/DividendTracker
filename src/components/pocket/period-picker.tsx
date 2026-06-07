"use client";

import { useState } from "react";

interface PeriodOption {
  key: string; // "all" | "YYYY-MM"
  label: string; // "Year" | "Jan" …
}

/**
 * Bottom-sheet period picker (reuses the .pk-sheet shell that the portfolio picker
 * and GroupManager use). Two steps in one sheet:
 *   1. pick a YEAR (chips) — the parent refetches that year's data, so the period
 *      list below updates (and the period resets to "Year"); the sheet stays open.
 *   2. pick a PERIOD ("Year" + each month with data) — sets it and dismisses.
 * Rendered inside the history view (.pk-history has no transformed ancestor, so the
 * position:fixed sheet still anchors to the viewport and paints above the tab bar).
 */
export function PeriodPicker({
  year,
  years,
  onYear,
  periods,
  activeKey,
  loading,
  onPeriod,
  onClose,
}: {
  year: number | null;
  years: number[];
  onYear: (y: number) => void;
  periods: PeriodOption[];
  activeKey: string;
  loading: boolean; // a year switch refetches; hide the (stale) period list until it lands
  onPeriod: (key: string) => void;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 220); // matches the slide-down/fade-out keyframes
  };
  const pickPeriod = (key: string) => {
    onPeriod(key);
    requestClose();
  };

  return (
    <>
      <div className="pk-sheet-scrim" data-closing={closing || undefined} onClick={requestClose} />
      <div
        className="pk-sheet"
        data-closing={closing || undefined}
        role="dialog"
        aria-modal="true"
        aria-label="Select period"
      >
        <div className="pk-sheet-grip" />
        <div className="pk-sheet-head">
          <span className="pk-sheet-title">Period</span>
          <button type="button" className="pk-textbtn" onClick={requestClose}>
            Done
          </button>
        </div>

        {years.length > 1 && (
          <section>
            <div className="pk-section-label">Year</div>
            <div className="pk-chips" role="group" aria-label="Year">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  className="pk-chip"
                  data-active={y === year}
                  aria-pressed={y === year}
                  onClick={() => onYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* "Full year" (not "Year") so the annual aggregate row reads distinctly
            from the YEAR (which-calendar-year) chips directly above it. While a
            year switch is loading, the old year's months are stale — hide them so
            a tap can't land on a month that's about to vanish. */}
        {loading ? (
          <p className="pk-note">Loading…</p>
        ) : (
          <div className="pk-pf-list" role="listbox" aria-label="Select period">
            {periods.map((p) => (
              <button
                key={p.key}
                type="button"
                className="pk-pfrow"
                data-active={p.key === activeKey}
                role="option"
                aria-selected={p.key === activeKey}
                onClick={() => pickPeriod(p.key)}
              >
                <span className="pk-pfrow-main">
                  <span className="pk-pfrow-name">{p.key === "all" ? "Full year" : p.label}</span>
                </span>
                {p.key === activeKey && (
                  <span className="pk-pfrow-check" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

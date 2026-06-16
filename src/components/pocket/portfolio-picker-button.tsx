"use client";

import { forwardRef } from "react";

/**
 * Tappable "PortfolioName ▾" that opens the root PortfolioPicker (sets the shared
 * activeId). The name span takes a forwarded ref so Dividends can imperatively
 * live-update it during a portfolio swipe. Visual size is set by the parent
 * context (.pk-dividends-head = small caption · .pk-summary = header identity).
 */
export const PortfolioPickerButton = forwardRef<HTMLSpanElement, { name: string; onOpen: () => void }>(
  function PortfolioPickerButton({ name, onOpen }, ref) {
    return (
      <button
        type="button"
        className="pk-pf-pick"
        onClick={onOpen}
        aria-label={`Portfolio: ${name}. Tap to change.`}
      >
        <span className="pk-pf-pick-name" ref={ref}>{name}</span>
        <span className="pk-pf-pick-caret" aria-hidden>▾</span>
      </button>
    );
  }
);

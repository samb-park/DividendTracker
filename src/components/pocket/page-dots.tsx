"use client";

import { forwardRef } from "react";

/**
 * Imperatively light up the dot at `active` (live, per swipe frame — no React
 * re-render). The ref points at the `.pk-dots` container; its children are the
 * dot buttons in order. Safe on null (count<=1 renders nothing).
 */
export function setActiveDots(el: HTMLDivElement | null, active: number) {
  if (!el) return;
  const n = el.children.length;
  const a = Math.max(0, Math.min(n - 1, active));
  for (let i = 0; i < n; i++) {
    (el.children[i] as HTMLElement).dataset.active = i === a ? "true" : "false";
  }
}

interface Props {
  count: number;
  activeIndex: number;
  onSelect: (i: number) => void; // tap a dot → jump the pager
  ariaLabel?: string; // group label, e.g. "Portfolios"
  itemLabel?: (i: number) => string; // per-dot accessible name, e.g. the portfolio/period name
}

/**
 * Shared page-control: a centered row of tappable dots that mark how many pages a
 * swipeable surface has and which one is active — placed at the TOP of every
 * pager (Dividends/Upcoming/History/Transactions) so the swipe is discoverable.
 * The active dot is set live from the pager's onProgress via setActiveDots(); the
 * activeIndex prop seeds the settled state. Renders nothing for a single page.
 */
export const PageDots = forwardRef<HTMLDivElement, Props>(function PageDots(
  { count, activeIndex, onSelect, ariaLabel = "Pages", itemLabel },
  ref
) {
  if (count <= 1) return null;
  return (
    <div className="pk-dots" ref={ref} role="group" aria-label={ariaLabel}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          className="pk-dot-nav"
          data-active={i === activeIndex}
          aria-label={itemLabel ? itemLabel(i) : `Page ${i + 1}`}
          aria-current={i === activeIndex || undefined}
          onClick={() => onSelect(i)}
        />
      ))}
    </div>
  );
});

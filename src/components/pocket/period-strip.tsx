"use client";

import { forwardRef } from "react";

/**
 * History period indicator that slides 1:1 WITH the swipe (matches the finger
 * speed, like the Upcoming pill). A horizontal strip of all period labels,
 * translated by --period-progress (the pager's live onProgress fraction) and
 * clipped to one cell — so only the current period shows at rest, and the next
 * one tracks in as you swipe. Replaces the old settle-time slide.
 */
export const PeriodStrip = forwardRef<HTMLDivElement, { labels: string[] }>(function PeriodStrip(
  { labels },
  ref
) {
  return (
    <div className="pk-period" ref={ref}>
      <div className="pk-period-track">
        {labels.map((l, i) => (
          <span className="pk-period-cell" key={i}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
});

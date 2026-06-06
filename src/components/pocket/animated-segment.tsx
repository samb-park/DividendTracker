"use client";

import type { CSSProperties } from "react";

/**
 * Tap-driven segmented control with the same sliding pill as the Upcoming
 * All/Ex/Pay control — so every segment in /pocket animates identically. The pill
 * glides to the active index via a CSS transition (.pk-seg-tap). The swipe-pager
 * segment (Upcoming) uses .pk-seg-anim WITHOUT .pk-seg-tap because it drives
 * --seg-progress live from scroll; this one sets it from the active index.
 */
export function AnimatedSegment<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      className="pk-seg pk-seg-anim pk-seg-tap"
      role="group"
      aria-label={ariaLabel}
      style={{ "--seg-count": options.length, "--seg-progress": idx } as CSSProperties}
    >
      <span className="pk-seg-pill" aria-hidden />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="pk-seg-btn"
          data-active={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

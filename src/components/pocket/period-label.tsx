"use client";

import { useEffect, useRef } from "react";

/**
 * History period indicator (Year / Jan / … ). Shows only the current period, but
 * slide-fades in from the swipe direction when it changes (next = in from the
 * right, prev = in from the left) — the History analog of the Upcoming pill.
 * Re-keyed on the period index so the CSS animation replays on each change.
 */
export function PeriodLabel({ label, index }: { label: string; index: number }) {
  const prev = useRef(index);
  const dir = index >= prev.current ? "next" : "prev";
  useEffect(() => {
    prev.current = index;
  });
  return (
    <span className="pk-history-label" key={index} data-dir={dir}>
      {label}
    </span>
  );
}

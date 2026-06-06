"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

export interface SwipePagerHandle {
  /** Jump to a page instantly (cancels any pending settle so a stale swipe can't overwrite). */
  scrollToIndex: (i: number) => void;
}

interface Props {
  items: string[]; // page keys (filter values / period strings) — both contexts are string axes
  activeIndex: number;
  /** Defer the once-per-mount initial align until this is true (e.g. localStorage hydrated). */
  ready?: boolean;
  onSettle: (i: number) => void; // caller guards next !== current
  renderPage: (item: string, i: number) => ReactNode;
  pageClassName: string; // "pk-page" (Upcoming) | "pk-history-page" (History)
  trackClassName?: string; // default "pk-track" (reused verbatim)
}

/**
 * Reusable native scroll-snap pager for the TOP-ALIGNED list contexts (Upcoming
 * filters, History periods). NOT used by Dividends — the hero-centering pager
 * stays inline in pocket-shell so this component can never collapse its spacers.
 *
 * Per-instance state (trackRef/settleTimer/didInit): when the parent renders two
 * SwipePagers in distinct tab branches, crossing the boundary remounts the
 * component, so the once-per-mount initial align re-fires for each context with
 * its own activeIndex. Clamp math always uses THIS instance's items.length.
 */
export const SwipePager = forwardRef<SwipePagerHandle, Props>(function SwipePager(
  { items, activeIndex, ready = true, onSettle, renderPage, pageClassName, trackClassName = "pk-track" },
  ref
) {
  const trackRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | null>(null);
  const didInit = useRef(false);
  const prevLen = useRef(items.length);

  const clearTimer = () => {
    if (settleTimer.current) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  };

  // Page → state: settle-debounced; round by the real content width.
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    clearTimer();
    settleTimer.current = window.setTimeout(() => {
      const w = el.clientWidth || 1;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / w)));
      onSettle(i);
    }, 120);
  }, [items.length, onSettle]);

  // Initial align — ONCE per mount, only once `ready`. activeIndex is in deps so
  // the effect re-runs when readiness flips, but the didInit guard keeps it single-shot.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el || !ready || didInit.current) return;
    el.scrollLeft = Math.max(0, activeIndex) * el.clientWidth;
    didInit.current = true;
  }, [ready, activeIndex]);

  // Re-init on item-count change: clamp the current page into the new range so a
  // shrinking period set never leaves the pager scrolled past the end.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el || !didInit.current || prevLen.current === items.length) return;
    prevLen.current = items.length;
    const w = el.clientWidth || 1;
    const clamped = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / w)));
    el.scrollLeft = clamped * w;
  }, [items.length]);

  const scrollToIndex = useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el) return;
      clearTimer(); // imperative jump wins over any pending swipe-settle
      el.scrollLeft = Math.max(0, Math.min(items.length - 1, i)) * el.clientWidth;
    },
    [items.length]
  );
  useImperativeHandle(ref, () => ({ scrollToIndex }), [scrollToIndex]);

  useEffect(() => clearTimer, []);

  return (
    <div className={trackClassName} ref={trackRef} onScroll={onScroll}>
      {items.map((it, i) => (
        <div className={pageClassName} key={it}>
          {renderPage(it, i)}
        </div>
      ))}
    </div>
  );
});

"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
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
  /** Live fractional position (scrollLeft / clientWidth) on every scroll frame —
   *  e.g. to slide a segment pill 1:1 with the swipe. Also fired on align/jump. */
  onProgress?: (fraction: number) => void;
  /**
   * Drive the horizontal swipe with JS instead of native scroll. Use for pages
   * with TALL vertical-scroll content (History): native horizontal scroll-snap
   * loses to the inner vertical scroll on iOS, so the swipe "doesn't work". Here
   * the page is touch-action:pan-y (vertical stays native) and a horizontal-
   * dominant drag drives scrollLeft 1:1 (the pill/strip still track), snapping on
   * release. Used by History, Transactions, and Upcoming (any list that can grow
   * tall). Left off only for the Dividends hero (short, fixed-height — native works).
   */
  dragSwipe?: boolean;
  renderPage: (item: string, i: number) => ReactNode;
  pageClassName: string; // "pk-paged-page" (Upcoming + History sub-region pagers)
  trackClassName?: string; // default "pk-track" (reused verbatim)
}

/** rAF ease-out animation of scrollLeft (used to snap the JS drag pager on release). */
function animateScrollLeft(el: HTMLElement, to: number, dur = 240) {
  const from = el.scrollLeft;
  const dist = to - from;
  const t0 = performance.now();
  const ease = (p: number) => 1 - Math.pow(1 - p, 3);
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    el.scrollLeft = from + dist * ease(p);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const SwipePager = forwardRef<SwipePagerHandle, Props>(function SwipePager(
  { items, activeIndex, ready = true, onSettle, onProgress, dragSwipe = false, renderPage, pageClassName, trackClassName = "pk-track" },
  ref
) {
  const trackRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | null>(null);
  const didInit = useRef(false);
  const prevLen = useRef(items.length);
  const drag = useRef<{ x: number; y: number; sl: number; t: number; axis: "h" | "v" | null } | null>(null);
  // Lazy-mount window center (M4): only pages within ±1 of this index actually
  // render; the rest stay as width-keeping empty placeholders (so scrollLeft
  // geometry is untouched). Updated live while scrolling (rounded midpoint), so a
  // neighbor is always mounted before it becomes visible.
  const [center, setCenter] = useState(() => Math.max(0, activeIndex));

  const clearTimer = () => {
    if (settleTimer.current) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  };

  // Page → state: settle-debounced; round by the real content width. Fires on BOTH
  // native scrolling and the JS drag's programmatic scrollLeft writes.
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const f = el.scrollLeft / (el.clientWidth || 1);
    onProgress?.(f); // live, every frame
    // Slide the lazy-mount window with the scroll (React bails when unchanged).
    setCenter(Math.max(0, Math.min(items.length - 1, Math.round(f))));
    clearTimer();
    settleTimer.current = window.setTimeout(() => {
      const w = el.clientWidth || 1;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / w)));
      onSettle(i);
    }, 120);
  }, [items.length, onSettle, onProgress]);

  // Initial align — ONCE per mount, only once `ready`. activeIndex is in deps so
  // the effect re-runs when readiness flips, but the didInit guard keeps it single-shot.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el || !ready || didInit.current) return;
    const i = Math.max(0, activeIndex);
    el.scrollLeft = i * el.clientWidth;
    onProgress?.(i); // set the pill's initial position before paint (no flash)
    setCenter(Math.min(items.length - 1, i));
    didInit.current = true;
  }, [ready, activeIndex, items.length, onProgress]);

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
      const clamped = Math.max(0, Math.min(items.length - 1, i));
      setCenter(clamped); // mount the target page in the same commit as the jump
      el.scrollLeft = clamped * el.clientWidth;
      onProgress?.(clamped);
    },
    [items.length, onProgress]
  );
  useImperativeHandle(ref, () => ({ scrollToIndex }), [scrollToIndex]);

  // Keep the lazy-mount window pinned to external selection changes and clamped
  // when the item set shrinks (mirrors the scroll-position clamp above).
  useEffect(() => {
    setCenter(Math.max(0, Math.min(items.length - 1, activeIndex)));
  }, [activeIndex, items.length]);

  useEffect(() => clearTimer, []);

  // M10: once a drag locks to the HORIZONTAL axis, eat the default touch action
  // so the page underneath can't co-scroll vertically with a diagonal finger.
  // Must be a NATIVE non-passive listener — React's synthetic touchmove is
  // registered passive, so preventDefault() there is ignored. Vertical (or
  // unlocked) gestures pass through untouched: native pan-y scroll stays native.
  useEffect(() => {
    const el = trackRef.current;
    if (!dragSwipe || !el) return;
    const blockWhenHorizontal = (e: globalThis.TouchEvent) => {
      if (drag.current?.axis === "h" && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", blockWhenHorizontal, { passive: false });
    return () => el.removeEventListener("touchmove", blockWhenHorizontal);
  }, [dragSwipe]);

  // JS drag handlers (only wired when dragSwipe). Horizontal-dominant drag drives
  // scrollLeft 1:1; a vertical gesture is left to the page's native pan-y scroll.
  const onTouchStart = useCallback((e: ReactTouchEvent) => {
    const el = trackRef.current;
    if (!el) return;
    clearTimer();
    el.style.transition = ""; // cancel any in-flight rubber-band spring; grab is immediate
    const t = e.touches[0];
    drag.current = { x: t.clientX, y: t.clientY, sl: el.scrollLeft, t: performance.now(), axis: null };
  }, []);

  const onTouchMove = useCallback(
    (e: ReactTouchEvent) => {
      const el = trackRef.current;
      const d = drag.current;
      if (!el || !d) return;
      const t = e.touches[0];
      const dx = d.x - t.clientX;
      const dy = t.clientY - d.y;
      if (d.axis === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        d.axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (d.axis === "h") {
        const max = Math.max(0, (items.length - 1) * el.clientWidth);
        const raw = d.sl + dx;
        const clamped = Math.max(0, Math.min(max, raw));
        el.scrollLeft = clamped; // 1:1 → onScroll → strip tracks (stays in-range)
        // Past an edge scrollLeft can't follow the finger, so the track itself
        // gives with resistance (0.3×) — iOS-style rubber-band; springs back on release.
        const overshoot = raw - clamped;
        el.style.transform = overshoot ? `translateX(${-overshoot * 0.3}px)` : "";
      }
    },
    [items.length]
  );

  const onTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      const el = trackRef.current;
      const d = drag.current;
      drag.current = null;
      if (!el || !d || d.axis !== "h") return;
      // Spring any edge rubber-band back to rest (transform is separate from the
      // scrollLeft snap below, so they animate together).
      if (el.style.transform) {
        el.style.transition = "transform 0.34s cubic-bezier(0.32, 0.72, 0, 1)";
        el.style.transform = "";
        window.setTimeout(() => {
          if (trackRef.current) trackRef.current.style.transition = "";
        }, 360);
      }
      const w = el.clientWidth || 1;
      const startPage = Math.round(d.sl / w);
      const t = e.changedTouches[0];
      const dx = d.x - t.clientX;
      const elapsed = performance.now() - d.t;
      let target = Math.round(el.scrollLeft / w);
      if (elapsed < 250 && Math.abs(dx) > 30) target = startPage + Math.sign(dx); // quick flick
      target = Math.max(0, Math.min(items.length - 1, target));
      animateScrollLeft(el, target * w);
    },
    [items.length]
  );

  const cls = trackClassName + (dragSwipe ? " pk-track-drag" : "");
  return (
    <div
      className={cls}
      ref={trackRef}
      onScroll={onScroll}
      onTouchStart={dragSwipe ? onTouchStart : undefined}
      onTouchMove={dragSwipe ? onTouchMove : undefined}
      onTouchEnd={dragSwipe ? onTouchEnd : undefined}
    >
      {items.map((it, i) => (
        <div className={pageClassName} key={it}>
          {/* Lazy mount (M4): only active±1 render; the rest are width-keeping
              placeholders (the page div itself IS the placeholder — flex-basis
              100% keeps the track geometry, so scrollLeft math is unchanged).
              A far page re-mounts fresh when scrolled back into the window
              (scroll position resets to top — acceptable for these lists). */}
          {Math.abs(i - center) <= 1 ? renderPage(it, i) : null}
        </div>
      ))}
    </div>
  );
});

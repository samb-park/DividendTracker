"use client";

import { useRef } from "react";
import type { Basis, EventFilter, HistoryMode, TickerAgg } from "@/lib/pocket-types";
import { SwipePager, type SwipePagerHandle } from "./swipe-pager";
import { PageDots, setActiveDots } from "./page-dots";
import { HistoryModeToggle } from "./history-mode-toggle";
import { UpcomingEvents, UPCOMING_FILTER_OPTS } from "./upcoming-list";

const UPCOMING_FILTERS: EventFilter[] = UPCOMING_FILTER_OPTS.map((o) => o.value);

/**
 * The "Upcoming" mode of the Activity tab: future ex/pay events for the active
 * portfolio. A FIXED header ("Activity" + the 4-way Activity switch + the All/Ex/Pay
 * segment) above a swipeable list. Swiping the list cycles the event filter (its
 * pill slides 1:1); the Activity switch (mode) jumps to the other modes. Same
 * fixed-header + sub-region pager pattern as History — its own SwipePager instance.
 */
export function UpcomingView({
  included,
  basis,
  loading,
  eventFilter,
  setEventFilter,
  hydrated,
  mode,
  setMode,
}: {
  included: TickerAgg[];
  basis: Basis;
  loading: boolean;
  eventFilter: EventFilter;
  setEventFilter: (f: EventFilter) => void;
  hydrated: boolean;
  mode: HistoryMode;
  setMode: (m: HistoryMode) => void;
}) {
  const pagerRef = useRef<SwipePagerHandle>(null);
  const segRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, UPCOMING_FILTERS.indexOf(eventFilter));
  return (
    <div className="pk-upcoming">
      {/* FIXED header: title + the Activity switch + the All/Ex/Pay segment. The
          white pill slides 1:1 with the swipe (onProgress sets --seg-progress). */}
      <div className="pk-upcoming-head">
        <h1 className="pk-title">Activity</h1>
        <HistoryModeToggle mode={mode} setMode={setMode} />
        <div className="pk-seg pk-seg-anim" ref={segRef} role="group" aria-label="Event filter">
          <span className="pk-seg-pill" aria-hidden />
          {UPCOMING_FILTER_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="pk-seg-btn"
              data-active={eventFilter === o.value}
              aria-pressed={eventFilter === o.value}
              onClick={() => pagerRef.current?.scrollToIndex(UPCOMING_FILTERS.indexOf(o.value))}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pk-paged-region">
        <SwipePager
          ref={pagerRef}
          items={UPCOMING_FILTERS}
          activeIndex={idx}
          ready={hydrated}
          pageClassName="pk-paged-page"
          dragSwipe
          onProgress={(f) => {
            segRef.current?.style.setProperty("--seg-progress", String(f));
            setActiveDots(dotsRef.current, Math.round(f));
          }}
          onSettle={(i) => {
            const f = UPCOMING_FILTERS[i];
            if (f !== eventFilter) setEventFilter(f);
          }}
          renderPage={(f) => (
            <UpcomingEvents tickers={included} basis={basis} filter={f as EventFilter} loading={loading} />
          )}
        />
      </div>
      {/* Page dots DOCKED below the list, just above the tab bar — the three filter pages. */}
      <PageDots
        ref={dotsRef}
        count={UPCOMING_FILTERS.length}
        activeIndex={idx}
        onSelect={(i) => pagerRef.current?.scrollToIndex(i)}
        ariaLabel="Event filter"
        itemLabel={(i) => UPCOMING_FILTER_OPTS[i].label}
      />
    </div>
  );
}

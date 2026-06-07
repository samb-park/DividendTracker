"use client";

import { useState } from "react";
import type { Basis, EventFilter, HistoryMode, TickerAgg } from "@/lib/pocket-types";
import { HistoryView } from "./history-view";
import { TransactionView } from "./transaction-view";
import { CashFlowView } from "./cash-flow-view";
import { UpcomingView } from "./upcoming-view";

/**
 * Activity tab = the merged Upcoming + History surface. A single 4-way switch
 * (Upcoming / Received / Trades / Cash) picks the mode; each mode renders its own
 * self-contained surface (so the proven per-view height chains stay intact).
 */
export function HistoryTab({
  basis,
  fxRate,
  upcomingIncluded,
  loading,
  eventFilter,
  setEventFilter,
  eventFilterHydrated,
}: {
  basis: Basis;
  fxRate: number | null;
  upcomingIncluded: TickerAgg[];
  loading: boolean;
  eventFilter: EventFilter;
  setEventFilter: (f: EventFilter) => void;
  eventFilterHydrated: boolean;
}) {
  const [mode, setMode] = useState<HistoryMode>("upcoming");
  if (mode === "upcoming")
    return (
      <UpcomingView
        included={upcomingIncluded}
        basis={basis}
        loading={loading}
        eventFilter={eventFilter}
        setEventFilter={setEventFilter}
        hydrated={eventFilterHydrated}
        mode={mode}
        setMode={setMode}
      />
    );
  if (mode === "transactions") return <TransactionView fxRate={fxRate} mode={mode} setMode={setMode} />;
  if (mode === "cashflow") return <CashFlowView fxRate={fxRate} mode={mode} setMode={setMode} />;
  return <HistoryView basis={basis} fxRate={fxRate} mode={mode} setMode={setMode} />;
}

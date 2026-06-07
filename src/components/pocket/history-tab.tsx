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
 * self-contained surface (so the proven per-view height chains stay intact). The
 * portfolio picker (header) + activeAccounts scope all four modes by the shared
 * selection (Upcoming by ticker∩account; the history modes by account only).
 */
export function HistoryTab({
  basis,
  fxRate,
  upcomingIncluded,
  loading,
  eventFilter,
  setEventFilter,
  eventFilterHydrated,
  portfolioName,
  activeAccounts,
  onOpenPicker,
}: {
  basis: Basis;
  fxRate: number | null;
  upcomingIncluded: TickerAgg[];
  loading: boolean;
  eventFilter: EventFilter;
  setEventFilter: (f: EventFilter) => void;
  eventFilterHydrated: boolean;
  portfolioName: string;
  activeAccounts: string[];
  onOpenPicker: () => void;
}) {
  const [mode, setMode] = useState<HistoryMode>("upcoming");
  const picker = { portfolioName, onOpenPicker };
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
        {...picker}
      />
    );
  if (mode === "transactions")
    return <TransactionView fxRate={fxRate} mode={mode} setMode={setMode} activeAccounts={activeAccounts} {...picker} />;
  if (mode === "cashflow")
    return <CashFlowView fxRate={fxRate} mode={mode} setMode={setMode} activeAccounts={activeAccounts} {...picker} />;
  return <HistoryView basis={basis} fxRate={fxRate} mode={mode} setMode={setMode} activeAccounts={activeAccounts} {...picker} />;
}

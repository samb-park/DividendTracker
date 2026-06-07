"use client";

import type { HistoryMode } from "@/lib/pocket-types";
import { AnimatedSegment } from "./animated-segment";

// The merged "Activity" tab's 4-way switch. Short labels so four segments fit the
// 390px row: "Received" = received dividends, "Trades" = transaction log, "Cash" = cash flow.
const OPTS: { value: HistoryMode; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "dividends", label: "Received" },
  { value: "transactions", label: "Trades" },
  { value: "cashflow", label: "Cash" },
];

export function HistoryModeToggle({ mode, setMode }: { mode: HistoryMode; setMode: (m: HistoryMode) => void }) {
  return <AnimatedSegment options={OPTS} value={mode} onChange={setMode} ariaLabel="Activity mode" />;
}

"use client";

import type { HistoryMode } from "@/lib/pocket-types";
import { AnimatedSegment } from "./animated-segment";

const OPTS: { value: HistoryMode; label: string }[] = [
  { value: "dividends", label: "Dividends" },
  { value: "transactions", label: "Transactions" },
];

export function HistoryModeToggle({ mode, setMode }: { mode: HistoryMode; setMode: (m: HistoryMode) => void }) {
  return <AnimatedSegment options={OPTS} value={mode} onChange={setMode} ariaLabel="History mode" />;
}

"use client";

import { useState } from "react";
import type { Basis, HistoryMode } from "@/lib/pocket-types";
import { HistoryView } from "./history-view";
import { TransactionView } from "./transaction-view";

/** History tab = received dividends + transaction log, switched by a segmented toggle. */
export function HistoryTab({ basis, fxRate }: { basis: Basis; fxRate: number | null }) {
  const [mode, setMode] = useState<HistoryMode>("dividends");
  return mode === "dividends" ? (
    <HistoryView basis={basis} fxRate={fxRate} mode={mode} setMode={setMode} />
  ) : (
    <TransactionView fxRate={fxRate} mode={mode} setMode={setMode} />
  );
}

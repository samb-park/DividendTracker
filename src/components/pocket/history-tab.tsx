"use client";

import { useState } from "react";
import type { Basis, HistoryMode } from "@/lib/pocket-types";
import { HistoryView } from "./history-view";
import { TransactionView } from "./transaction-view";
import { CashFlowView } from "./cash-flow-view";

/** History tab = received dividends + transaction log + cash flow, switched by a segmented toggle. */
export function HistoryTab({ basis, fxRate }: { basis: Basis; fxRate: number | null }) {
  const [mode, setMode] = useState<HistoryMode>("dividends");
  if (mode === "transactions") return <TransactionView fxRate={fxRate} mode={mode} setMode={setMode} />;
  if (mode === "cashflow") return <CashFlowView fxRate={fxRate} mode={mode} setMode={setMode} />;
  return <HistoryView basis={basis} fxRate={fxRate} mode={mode} setMode={setMode} />;
}

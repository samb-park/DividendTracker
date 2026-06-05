"use client";

import type { HistoryMode } from "@/lib/pocket-types";

const OPTS: { value: HistoryMode; label: string }[] = [
  { value: "dividends", label: "Dividends" },
  { value: "transactions", label: "Transactions" },
];

export function HistoryModeToggle({ mode, setMode }: { mode: HistoryMode; setMode: (m: HistoryMode) => void }) {
  return (
    <div className="pk-seg" role="group" aria-label="History mode">
      {OPTS.map((o) => (
        <button
          key={o.value}
          type="button"
          className="pk-seg-btn"
          data-active={mode === o.value}
          onClick={() => setMode(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import type { PortfolioOption } from "@/lib/pocket-types";
import { PortfolioRow } from "./portfolio-row";
import { useSheetBack } from "./use-sheet-back";

/**
 * Bottom-sheet portfolio picker (reuses the .pk-sheet shell that GroupManager
 * uses). Lists All + built-in account portfolios + user groups; tapping one sets
 * the shared activeId (so Charts AND Dividends follow) and dismisses. Rendered at
 * the PocketShell root — NOT inside a tab — so position:fixed anchors to the
 * viewport and the scrim paints above the tab bar.
 */
export function PortfolioPicker({
  options,
  activeId,
  onSelect,
  onClose,
}: {
  options: PortfolioOption[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 220); // matches the slide-down/fade-out keyframes
  };
  useSheetBack(requestClose); // system back closes the sheet instead of leaving /pocket
  const pick = (id: string | null) => {
    onSelect(id);
    requestClose();
  };

  return (
    <>
      <div className="pk-sheet-scrim" data-closing={closing || undefined} onClick={requestClose} />
      <div className="pk-sheet" data-closing={closing || undefined} role="dialog" aria-modal="true" aria-label="Select portfolio">
        <div className="pk-sheet-grip" />
        <div className="pk-sheet-head">
          <span className="pk-sheet-title">Portfolio</span>
          <button type="button" className="pk-textbtn" onClick={requestClose}>
            Done
          </button>
        </div>
        <div className="pk-pf-list" role="listbox" aria-label="Select portfolio">
          {options.map((o) => (
            <PortfolioRow
              key={o.id ?? "all"}
              color={o.color}
              name={o.name}
              subtitle={o.kind === "account" ? "Account" : undefined}
              selected={activeId === o.id}
              asOption
              onClick={() => pick(o.id)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

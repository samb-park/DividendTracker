"use client";

import type { Basis, PortfolioOption } from "@/lib/pocket-types";
import { PortfolioRow } from "./portfolio-row";
import { NotifySettings } from "./notify-settings";
import { AnimatedSegment } from "./animated-segment";
import { PocketPanel } from "./pocket-panel";

interface Props {
  activePortfolio: PortfolioOption; // the current selection (shown as a single row)
  onOpenPicker: () => void; // opens the shared PortfolioPicker sheet
  onEdit: () => void;
  basis: Basis;
  setBasis: (b: Basis) => void;
}

const BASIS_OPTS: { value: Basis; label: string }[] = [
  { value: "net", label: "Net" },
  { value: "gross", label: "Gross" },
];

export function PocketSettings({ activePortfolio, onOpenPicker, onEdit, basis, setBasis }: Props) {
  return (
    <div className="pk-settings">
      <h1 className="pk-title">Settings</h1>

      {/* Selection now lives in every screen's header picker; Settings shows the
          current one as a single row that opens the same sheet. Reordering moved
          into "Manage portfolios". Both rows share one grouped card. */}
      <PocketPanel title="Portfolio" bodyClassName="flush">
        <div className="pk-card">
          <PortfolioRow
            color={activePortfolio.color}
            name={activePortfolio.name}
            subtitle={activePortfolio.kind === "account" ? "Account" : undefined}
            onClick={onOpenPicker}
          />
          <button type="button" className="pk-action pk-navrow" onClick={onEdit}>
            Manage portfolios
          </button>
        </div>
      </PocketPanel>

      <PocketPanel title="Amount basis">
        <AnimatedSegment options={BASIS_OPTS} value={basis} onChange={setBasis} ariaLabel="Amount basis" />
      </PocketPanel>

      <NotifySettings />
    </div>
  );
}

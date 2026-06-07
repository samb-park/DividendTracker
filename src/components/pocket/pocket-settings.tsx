"use client";

import type { Basis, PortfolioOption, ThemePref } from "@/lib/pocket-types";
import { PortfolioRow } from "./portfolio-row";
import { NotifySettings } from "./notify-settings";
import { AnimatedSegment } from "./animated-segment";

interface Props {
  activePortfolio: PortfolioOption; // the current selection (shown as a single row)
  onOpenPicker: () => void; // opens the shared PortfolioPicker sheet
  onEdit: () => void;
  basis: Basis;
  setBasis: (b: Basis) => void;
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
}

const THEME_OPTS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const BASIS_OPTS: { value: Basis; label: string }[] = [
  { value: "net", label: "Net" },
  { value: "gross", label: "Gross" },
];

export function PocketSettings({
  activePortfolio,
  onOpenPicker,
  onEdit,
  basis,
  setBasis,
  themePref,
  setThemePref,
}: Props) {
  return (
    <div className="pk-settings">
      <h1 className="pk-title">Settings</h1>

      <section>
        <div className="pk-section-label">Portfolio</div>
        {/* Selection now lives in every screen's header picker; Settings shows the
            current one as a single row that opens the same sheet. Reordering moved
            into "Manage portfolios". */}
        <PortfolioRow
          color={activePortfolio.color}
          name={activePortfolio.name}
          subtitle={activePortfolio.kind === "account" ? "Account" : undefined}
          onClick={onOpenPicker}
        />
        <button type="button" className="pk-action pk-navrow" onClick={onEdit}>
          Manage portfolios
        </button>
      </section>

      <section>
        <div className="pk-section-label">Amount basis</div>
        <AnimatedSegment options={BASIS_OPTS} value={basis} onChange={setBasis} ariaLabel="Amount basis" />
      </section>

      <section>
        <div className="pk-section-label">Theme</div>
        <AnimatedSegment options={THEME_OPTS} value={themePref} onChange={setThemePref} ariaLabel="Theme" />
      </section>

      <NotifySettings />
    </div>
  );
}

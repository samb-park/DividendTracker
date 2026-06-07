"use client";

import type { Basis, PocketGroup, PortfolioOption, ThemePref } from "@/lib/pocket-types";
import { DraggablePortfolioList } from "./draggable-portfolio-list";
import { NotifySettings } from "./notify-settings";
import { AnimatedSegment } from "./animated-segment";

interface Props {
  groups: PocketGroup[];
  accountPortfolios: PortfolioOption[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onReorder: (orderedIds: string[]) => void;
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
  groups,
  accountPortfolios,
  activeId,
  onSelect,
  onReorder,
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
        {/* Selection + ordering live here (not on Dividends). Tap selects; a
            long-press lifts a portfolio to drag-reorder it (also reorders the
            swipe pager, which derives its order from this list). */}
        <DraggablePortfolioList
          groups={groups}
          accountPortfolios={accountPortfolios}
          activeId={activeId}
          onSelect={onSelect}
          onReorder={onReorder}
        />
        {groups.length > 1 && <p className="pk-note">Hold a portfolio to drag and reorder.</p>}

        <button type="button" className="pk-action pk-navrow" onClick={onEdit}>
          Manage portfolios
        </button>
      </section>

      <section>
        <div className="pk-section-label">Amount basis</div>
        <AnimatedSegment options={BASIS_OPTS} value={basis} onChange={setBasis} ariaLabel="Amount basis" />
        <p className="pk-hint">Net = after withholding tax · Gross = before tax</p>
      </section>

      <section>
        <div className="pk-section-label">Theme</div>
        <AnimatedSegment options={THEME_OPTS} value={themePref} onChange={setThemePref} ariaLabel="Theme" />
      </section>

      <NotifySettings />
    </div>
  );
}

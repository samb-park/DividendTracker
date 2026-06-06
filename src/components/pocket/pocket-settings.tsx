"use client";

import type { Basis, PocketGroup, ThemePref } from "@/lib/pocket-types";
import { PortfolioRow } from "./portfolio-row";

interface Props {
  groups: PocketGroup[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
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
  activeId,
  onSelect,
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
        {/* Selection lives here (not on Dividends) — Dividends stays clean. */}
        <div className="pk-pf-list" role="listbox" aria-label="Select portfolio">
          <PortfolioRow
            color={null}
            name="All"
            selected={activeId === null}
            asOption
            onClick={() => onSelect(null)}
          />
          {groups.map((g) => (
            <PortfolioRow
              key={g.id}
              color={g.color}
              name={g.name}
              count={g.tickers.length}
              selected={activeId === g.id}
              asOption
              onClick={() => onSelect(g.id)}
            />
          ))}
        </div>

        <button type="button" className="pk-action pk-navrow" onClick={onEdit}>
          Manage portfolios
        </button>
      </section>

      <section>
        <div className="pk-section-label">Amount basis</div>
        <div className="pk-seg" role="group" aria-label="Amount basis">
          {BASIS_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="pk-seg-btn"
              data-active={basis === o.value}
              onClick={() => setBasis(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="pk-section-label">Theme</div>
        <div className="pk-seg" role="group" aria-label="Theme">
          {THEME_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="pk-seg-btn"
              data-active={themePref === o.value}
              onClick={() => setThemePref(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

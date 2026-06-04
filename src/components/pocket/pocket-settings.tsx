"use client";

import type { Basis, ThemePref } from "@/lib/pocket-types";

interface Props {
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

export function PocketSettings({ onEdit, basis, setBasis, themePref, setThemePref }: Props) {
  return (
    <div className="pk-settings">
      <h1 className="pk-title">Settings</h1>

      <section>
        <div className="pk-section-label">Holdings</div>
        <div className="pk-row-between">
          <span className="pk-field-label">Accounts &amp; tickers</span>
          <button type="button" className="pk-edit" onClick={onEdit}>
            Edit
          </button>
        </div>
      </section>

      <section>
        <div className="pk-section-label">Amount basis</div>
        <div className="pk-row-between">
          <span className="pk-field-label">{basis === "net" ? "Net (after tax)" : "Gross"}</span>
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

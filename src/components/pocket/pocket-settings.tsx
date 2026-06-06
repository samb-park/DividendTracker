"use client";

import type { Basis, PocketGroup, ThemePref } from "@/lib/pocket-types";

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

/** Color dot / emoji glyph for a group ("전체" → hollow dot). */
function Glyph({ group }: { group: PocketGroup | null }) {
  if (group?.icon) return <span className="pk-pfsel-emoji">{group.icon}</span>;
  if (group)
    return <span className="pk-dot" style={{ background: group.color || "var(--pk-muted)" }} aria-hidden />;
  return <span className="pk-dot pk-dot-all" aria-hidden />;
}

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
        <div className="pk-pf-list" role="listbox" aria-label="포트폴리오 선택">
          <button
            type="button"
            role="option"
            aria-selected={activeId === null}
            className="pk-pfsel-item"
            data-active={activeId === null}
            onClick={() => onSelect(null)}
          >
            <span className="pk-pfsel-mark">
              <Glyph group={null} />
            </span>
            <span className="pk-pfsel-name">전체</span>
            {activeId === null && (
              <span className="pk-pfsel-check" aria-hidden>
                ✓
              </span>
            )}
          </button>

          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              role="option"
              aria-selected={activeId === g.id}
              className="pk-pfsel-item"
              data-active={activeId === g.id}
              onClick={() => onSelect(g.id)}
            >
              <span className="pk-pfsel-mark">
                <Glyph group={g} />
              </span>
              <span className="pk-pfsel-name">{g.name}</span>
              <span className="pk-pfsel-count">{g.tickers.length}</span>
              {activeId === g.id && (
                <span className="pk-pfsel-check" aria-hidden>
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>

        <button type="button" className="pk-action" onClick={onEdit}>
          포트폴리오 · 계좌 관리
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

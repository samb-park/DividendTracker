"use client";

import { useState } from "react";
import type { PocketGroup } from "@/lib/pocket-types";

interface Props {
  groups: PocketGroup[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}

/** A glyph for a group: its emoji icon, else a colored dot. */
function Mark({ group }: { group: PocketGroup | null }) {
  if (group?.icon) return <span className="pk-pfsel-emoji">{group.icon}</span>;
  if (group)
    return <span className="pk-dot" style={{ background: group.color || "var(--pk-muted)" }} aria-hidden />;
  return <span className="pk-dot pk-dot-all" aria-hidden />;
}

/** Dropdown at the top of Dividends/Upcoming to pick the active portfolio. */
export function PortfolioSelect({ groups, activeId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const active = activeId ? groups.find((g) => g.id === activeId) ?? null : null;

  const pick = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div className="pk-pfsel">
      <button
        type="button"
        className="pk-pfsel-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Mark group={active} />
        <span className="pk-pfsel-name">{active ? active.name : "전체"}</span>
        <span className="pk-pfsel-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <>
          <div className="pk-pfsel-scrim" onClick={() => setOpen(false)} />
          <div className="pk-pfsel-menu" role="listbox" aria-label="포트폴리오 선택">
            <button
              type="button"
              role="option"
              aria-selected={activeId === null}
              className="pk-pfsel-item"
              data-active={activeId === null}
              onClick={() => pick(null)}
            >
              <Mark group={null} />
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
                onClick={() => pick(g.id)}
              >
                <Mark group={g} />
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
        </>
      )}
    </div>
  );
}

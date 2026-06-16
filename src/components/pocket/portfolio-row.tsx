"use client";

interface Props {
  color: string | null; // null → hollow "All" dot
  name: string;
  subtitle?: string; // edit context, e.g. "RRSP · 3 tickers"
  count?: number; // selection context: trailing ticker-count badge
  selected?: boolean; // active background (+ check when asOption)
  asOption?: boolean; // ARIA listbox option (select) vs plain button (navigate)
  onClick: () => void;
}

/**
 * One row representing a portfolio in a list — shared by the Settings selector
 * (asOption + check) and the manager list (subtitle + chevron) so both read in a
 * single visual language: [color dot] [name (+ subtitle)] [count] [check | chevron].
 */
export function PortfolioRow({ color, name, subtitle, count, selected = false, asOption = false, onClick }: Props) {
  return (
    <button
      type="button"
      className="pk-pfrow"
      data-active={selected}
      role={asOption ? "option" : undefined}
      aria-selected={asOption ? selected : undefined}
      onClick={onClick}
    >
      <span className="pk-pfrow-mark" aria-hidden>
        {color ? (
          <span className="pk-dot" style={{ background: color }} />
        ) : (
          <span className="pk-dot pk-dot-all" />
        )}
      </span>
      <span className="pk-pfrow-main">
        <span className="pk-pfrow-name">{name}</span>
        {subtitle && <span className="pk-pfrow-sub">{subtitle}</span>}
      </span>
      {count != null && (
        <span className="pk-pfrow-count">
          {count} ticker{count === 1 ? "" : "s"}
        </span>
      )}
      {asOption ? (
        selected && (
          <span className="pk-pfrow-check" aria-hidden>
            ✓
          </span>
        )
      ) : (
        <span className="pk-pfrow-chevron" aria-hidden>
          ›
        </span>
      )}
    </button>
  );
}

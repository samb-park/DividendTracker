"use client";

export type PocketTab = "dividends" | "charts" | "activity" | "settings";

interface Props {
  active: PocketTab;
  onChange: (tab: PocketTab) => void;
}

const TABS: { id: PocketTab; label: string }[] = [
  { id: "dividends", label: "Dividends" },
  { id: "charts", label: "Charts" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

export function PocketTabBar({ active, onChange }: Props) {
  return (
    <nav className="pk-tabbar" id="pk-tabbar" aria-label="Pocket sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="pk-tab"
          data-active={active === t.id}
          aria-current={active === t.id ? "page" : undefined}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

"use client";

import { Activity, ChartPie, CircleDollarSign, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type PocketTab = "dividends" | "charts" | "activity" | "settings";

interface Props {
  active: PocketTab;
  onChange: (tab: PocketTab) => void;
}

// iOS tab-bar grammar: icon above, 10px label below. Monochrome — active/inactive
// is the existing ink/muted contrast (icons inherit currentColor), no accent color.
const TABS: { id: PocketTab; label: string; icon: LucideIcon }[] = [
  { id: "dividends", label: "Dividends", icon: CircleDollarSign },
  { id: "charts", label: "Charts", icon: ChartPie },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
];

export function PocketTabBar({ active, onChange }: Props) {
  return (
    <nav className="pk-tabbar" id="pk-tabbar" aria-label="Pocket sections">
      {TABS.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            className="pk-tab"
            data-active={active === t.id}
            aria-current={active === t.id ? "page" : undefined}
            onClick={() => onChange(t.id)}
          >
            <Icon className="pk-tab-ico" size={21} strokeWidth={2} aria-hidden focusable="false" />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

"use client";

import { ChartPie, CircleDollarSign, ReceiptText, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type PocketTab = "dividends" | "charts" | "activity" | "settings";

interface Props {
  active: PocketTab;
  onChange: (tab: PocketTab) => void;
}

// Terminal tab-bar grammar: icon above, 9px ALL-CAPS label below (CSS). Icons
// inherit currentColor (muted → amber when active). ReceiptText for Activity —
// the tab is a payments/trades/cash ledger, not a health-style pulse feed.
const TABS: { id: PocketTab; label: string; icon: LucideIcon }[] = [
  { id: "dividends", label: "Dividends", icon: CircleDollarSign },
  { id: "charts", label: "Charts", icon: ChartPie },
  { id: "activity", label: "Activity", icon: ReceiptText },
  { id: "settings", label: "Settings", icon: Settings },
];

export function PocketTabBar({ active, onChange }: Props) {
  return (
    <nav className="pk-tabbar" id="pk-tabbar" aria-label="Pocket sections">
      {TABS.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            className="pk-tab"
            data-active={isActive}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onChange(t.id)}
          >
            {/* stroke hierarchy: the active icon reads heavier (no layout shift —
                stroke width doesn't change the 20px box) */}
            <Icon
              className="pk-tab-ico"
              size={20}
              strokeWidth={isActive ? 2.4 : 1.8}
              aria-hidden
              focusable="false"
            />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

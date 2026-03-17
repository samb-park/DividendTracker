"use client";

import { useState } from "react";

const TABS = [
  { key: "tab1", label: "TAB 1" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function MorePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("tab1");

  return (
    <div>
      {/* Top tab bar */}
      <div className="flex gap-1 mb-6 border-b border-border pb-3">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`btn-retro text-xs px-3 py-1 ${
              activeTab === tab.key ? "btn-retro-primary" : ""
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "tab1" && (
        <div className="text-muted-foreground text-xs text-center py-12 border border-dashed border-border">
          EMPTY
        </div>
      )}
    </div>
  );
}

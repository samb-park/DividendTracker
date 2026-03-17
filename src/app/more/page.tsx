"use client";

import { useState, useEffect } from "react";
import { CashFlow } from "@/components/cash-flow";

const TABS = [
  { key: "cashflow", label: "CASH FLOW" },
  { key: "tab2", label: "TAB 2" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function MorePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("cashflow");
  const [fxRate, setFxRate] = useState(1.35);

  useEffect(() => {
    fetch("/api/fx").then(r => r.json()).then(d => { if (d.rate) setFxRate(d.rate); }).catch(() => {});
  }, []);

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

      {activeTab === "cashflow" && <CashFlow fxRate={fxRate} />}
      {activeTab === "tab2" && (
        <div className="text-muted-foreground text-xs text-center py-12 border border-dashed border-border">
          EMPTY
        </div>
      )}
    </div>
  );
}

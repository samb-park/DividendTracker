"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const TABS = ["시장", "모니터", "차트", "뉴스", "포트", "옵션", "주문", "AI"] as const;
export type TabKey = (typeof TABS)[number];

function Clock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums text-[11px] text-muted-foreground">{now}</span>;
}

export function TopBar({
  activeTab,
  onTabChange,
  onCommand,
}: {
  activeTab: TabKey;
  onTabChange: (t: TabKey) => void;
  onCommand: (ticker: string) => void;
}) {
  const [cmd, setCmd] = useState("");

  const submit = () => {
    const t = cmd.trim().toUpperCase();
    if (t) {
      onCommand(t);
      onTabChange("차트");
      setCmd("");
    }
  };

  return (
    <header className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-background px-2 py-1.5">
      <div className="flex items-center gap-1.5 pr-2">
        <span className="text-sm font-bold tracking-tight text-primary">SnapTerminal</span>
        <span className="hidden text-[9px] uppercase tracking-wide text-muted-foreground sm:inline">
          US/KOR EQUITY INTEL
        </span>
      </div>

      <nav className="flex items-center gap-0.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={cn(
              "flex-shrink-0 rounded-sm px-2 py-1 text-[11px] font-semibold transition-colors",
              activeTab === t
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex items-center overflow-hidden rounded-sm border border-border bg-input">
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="티커 입력 (예: AAPL)"
            className="w-32 bg-transparent px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none sm:w-44"
          />
          <button
            onClick={submit}
            className="bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            GO
          </button>
        </div>
        <Clock />
      </div>
    </header>
  );
}

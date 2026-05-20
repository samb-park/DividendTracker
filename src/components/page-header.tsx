"use client";

import { usePathname } from "next/navigation";
import { tabs } from "./bottom-nav";

const NON_TAB_LABELS: Record<string, string> = {
  "/v1/settings": "SETTINGS",
};

export function PageHeader() {
  const pathname = usePathname();
  const tabMatch = tabs.find((t) => t.href === pathname);
  const label = tabMatch?.label ?? NON_TAB_LABELS[pathname ?? ""] ?? "DASHBOARD";

  return (
    <span className="text-primary font-medium tracking-wide text-sm">
      ▶ {label}
    </span>
  );
}

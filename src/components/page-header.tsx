"use client";

import { usePathname } from "next/navigation";
import { tabs } from "./bottom-nav";

export function PageHeader() {
  const pathname = usePathname();
  const current = tabs.find((t) => t.href === pathname);
  const label = current?.label ?? "DASHBOARD";

  return (
    <span className="text-primary font-medium tracking-widest text-sm">
      ▶ {label}
    </span>
  );
}

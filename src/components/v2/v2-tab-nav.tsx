"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/v2", label: "Summary" },
  { href: "/v2/graph", label: "Graph" },
  { href: "/v2/settings", label: "Settings" },
] as const;

export function V2TabNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 rounded-full bg-muted/40 p-1 backdrop-blur">
      {tabs.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

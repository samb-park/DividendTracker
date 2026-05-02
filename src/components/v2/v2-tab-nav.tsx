"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const tabs = [
  { href: "/v2", label: "Summary" },
  { href: "/v2/graph", label: "Graph" },
  { href: "/v2/settings", label: "Settings" },
] as const;

export function V2TabNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="v2-segmented" role="tablist" aria-label="v2 sections">
      {tabs.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            data-active={active}
            role="tab"
            aria-selected={active}
            onClick={(e) => {
              if (active) e.preventDefault();
              else router.prefetch(href);
            }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

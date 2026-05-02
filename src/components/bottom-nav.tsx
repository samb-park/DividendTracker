"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { BarChart3, Briefcase, CalendarDays, Receipt, TrendingUp } from "lucide-react";

export const tabs = [
  { href: "/v1",           label: "OVERVIEW",  icon: BarChart3 },
  { href: "/v1/portfolio", label: "HOLDINGS",  icon: Briefcase },
  { href: "/v1/calendar",  label: "CALENDAR",  icon: CalendarDays },
  { href: "/v1/more",      label: "HISTORY",   icon: Receipt },
  { href: "/v1/analysis",  label: "ANALYSIS",  icon: TrendingUp },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-shrink-0 border-t border-border bg-background safe-bottom">
      <div className="flex">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              replace
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] tracking-wide transition-colors ${
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={18} strokeWidth={1.5} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

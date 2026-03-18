"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, TrendingUp, CalendarDays, Layers, Settings } from "lucide-react";

export const tabs = [
  { href: "/",          label: "DASHBOARD", icon: LayoutDashboard },
  { href: "/portfolio", label: "PORTFOLIO",  icon: TrendingUp },
  { href: "/calendar",  label: "CALENDAR",   icon: CalendarDays },
  { href: "/more",      label: "MORE",       icon: Layers },
  { href: "/settings",  label: "SETTINGS",   icon: Settings },
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

"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, TrendingUp, CalendarDays, Settings } from "lucide-react";

export const tabs = [
  { href: "/",          label: "DASHBOARD", icon: LayoutDashboard },
  { href: "/portfolio", label: "PORTFOLIO",  icon: TrendingUp },
  { href: "/calendar",  label: "CALENDAR",   icon: CalendarDays },
  { href: "/settings",  label: "SETTINGS",   icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-background z-50 safe-bottom">
      <div className="flex">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] tracking-widest transition-colors ${
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

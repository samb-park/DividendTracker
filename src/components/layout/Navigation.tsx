"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, BriefcaseBusiness, Receipt, CalendarDays, Settings } from "lucide-react";
import { AuthStatus } from "@/components/auth/auth-status";

const navItems = [
  { href: "/", label: "DASHBOARD", icon: LayoutDashboard },
  { href: "/portfolio", label: "PORTFOLIO", icon: BriefcaseBusiness },
  { href: "/transactions", label: "TRANSACTIONS", icon: Receipt },
  { href: "/calendar", label: "CALENDAR", icon: CalendarDays },
  { href: "/settings", label: "SETTINGS", icon: Settings },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <>
      <nav className="hidden md:block bg-white/95 dark:bg-slate-950/95 border-b border-gray-100 dark:border-slate-800 sticky top-0 z-50 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-lg font-semibold text-gray-900 dark:text-white">
              DividendTracker
            </Link>
            <div className="flex items-center gap-4">
              <AuthStatus />
              <div className="flex items-center gap-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-[#0a8043]/10 text-[#0a8043] dark:bg-[#0a8043]/20 dark:text-green-300"
                          : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-900"
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-950/95 backdrop-blur-lg border-t border-gray-100 dark:border-slate-800">
        <div className="flex items-center justify-around h-14 px-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 ease-out",
                  isActive ? "text-[#0a8043] dark:text-green-300" : "text-gray-400 dark:text-slate-500 active:scale-95"
                )}
              >
                <Icon className={cn("transition-all duration-300 ease-out", isActive ? "w-5 h-5" : "w-[18px] h-[18px]")} />
                <span className={cn("text-[9px] font-medium mt-0.5 transition-all duration-300 ease-out", isActive ? "opacity-100" : "opacity-60")}>
                  {item.label.charAt(0) + item.label.slice(1).toLowerCase()}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

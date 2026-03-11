"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, Receipt, User, Settings } from "lucide-react";

const navItems = [
  { href: "/", label: "HOME", icon: Home },
  { href: "/transactions", label: "TRANSACTIONS", icon: Receipt },
  { href: "/accounts", label: "ACCOUNTS", icon: User },
  { href: "/settings", label: "SETTINGS", icon: Settings },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <>
      <nav className="hidden md:block bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-lg font-semibold text-gray-900">
              DividendTracker
            </Link>
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
                        ? "bg-[#0a8043]/10 text-[#0a8043]"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-gray-100">
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
                  isActive ? "text-[#0a8043]" : "text-gray-400 active:scale-95"
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

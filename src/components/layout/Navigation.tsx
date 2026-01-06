"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, BarChart3, Receipt, User, DollarSign } from "lucide-react";

const navItems = [
  { href: "/", label: "HOME", icon: Home },
  { href: "/holdings", label: "HOLDINGS", icon: BarChart3 },
  { href: "/transactions", label: "TRANSACTIONS", icon: Receipt },
  { href: "/accounts", label: "ACCOUNTS", icon: User },
  { href: "/dividends", label: "DIVIDENDS", icon: DollarSign },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop Navigation - Top Bar */}
      <nav className="hidden md:block bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-10">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0a8043] to-[#16a34a] flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-gray-900 tracking-tight">
                  Portfolio
                </span>
              </Link>

              {/* Desktop Menu */}
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
        </div>
      </nav>

      {/* Mobile Navigation - Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-gray-100 safe-area-bottom">
        <div className="flex items-center justify-around h-[68px] px-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex flex-col items-center justify-center flex-1 h-full py-2 transition-all duration-300 ease-out",
                  isActive
                    ? "text-[#0a8043]"
                    : "text-gray-400 active:scale-95"
                )}
              >
                {/* Active indicator pill */}
                <div
                  className={cn(
                    "absolute top-1.5 w-12 h-[3px] rounded-full transition-all duration-300 ease-out",
                    isActive
                      ? "bg-[#0a8043] opacity-100"
                      : "bg-transparent opacity-0"
                  )}
                />

                {/* Icon container with subtle background on active */}
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 ease-out",
                    isActive
                      ? "bg-[#0a8043]/10"
                      : "bg-transparent"
                  )}
                >
                  <Icon
                    className={cn(
                      "transition-all duration-300 ease-out",
                      isActive ? "w-[22px] h-[22px]" : "w-5 h-5"
                    )}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                </div>

                {/* Label */}
                <span
                  className={cn(
                    "text-[10px] font-medium mt-0.5 transition-all duration-300 ease-out",
                    isActive
                      ? "opacity-100 translate-y-0"
                      : "opacity-60 translate-y-0"
                  )}
                >
                  {item.label.charAt(0) + item.label.slice(1).toLowerCase()}
                </span>
              </Link>
            );
          })}
        </div>
        {/* Safe area for devices with home indicator */}
        <div className="h-safe-area-bottom bg-white/95" />
      </nav>

      {/* Mobile Header - Simple logo only */}
      <header className="md:hidden bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="flex items-center justify-center h-14 px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0a8043] to-[#16a34a] flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-semibold text-gray-900 tracking-tight">
              Portfolio
            </span>
          </Link>
        </div>
      </header>
    </>
  );
}

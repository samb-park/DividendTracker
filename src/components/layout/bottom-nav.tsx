"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Search,
  DollarSign,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { href: "/holdings", icon: Wallet, label: "Holdings" },
  { href: "/transactions", icon: ArrowLeftRight, label: "Activity" },
  { href: "/dividends", icon: DollarSign, label: "Dividends" },
  { href: "/search", icon: Search, label: "Search" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t pb-safe">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-center flex-1 h-full",
                "transition-colors touch-manipulation",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
              aria-label={item.label}
            >
              <item.icon className="h-6 w-6" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function DesktopNav() {
  const pathname = usePathname();

  const allItems = [
    ...navItems,
    { href: "/accounts", icon: Settings, label: "Accounts" },
    { href: "/import", icon: ArrowLeftRight, label: "Import" },
  ];

  return (
    <nav className="hidden md:flex flex-col gap-1 p-4 w-56 border-r h-screen sticky top-0">
      <div className="font-bold text-lg mb-4 px-3">Portfolio</div>
      {allItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

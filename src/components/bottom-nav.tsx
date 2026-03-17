"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { LayoutDashboard, TrendingUp, CalendarDays, Settings } from "lucide-react";

export const tabs = [
  { href: "/",          label: "DASHBOARD", icon: LayoutDashboard },
  { href: "/portfolio", label: "PORTFOLIO",  icon: TrendingUp },
  { href: "/calendar",  label: "CALENDAR",   icon: CalendarDays },
  { href: "/settings",  label: "SETTINGS",   icon: Settings },
];

const SWIPE_THRESHOLD = 50;   // px minimum horizontal travel
const SWIPE_RATIO     = 1.5;  // horizontal must be this × vertical

export function BottomNav() {
  const pathname = usePathname();
  const router   = useRouter();

  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchStart.current = { x: t.clientX, y: t.clientY };
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.current.x;
      const dy = t.clientY - touchStart.current.y;
      touchStart.current = null;

      // Must be horizontal, must exceed threshold
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;

      const idx = tabs.findIndex((tab) => tab.href === pathname);
      if (idx === -1) return;

      if (dx < 0 && idx < tabs.length - 1) {
        // Swipe left -> next tab
        router.push(tabs[idx + 1].href);
      } else if (dx > 0 && idx > 0) {
        // Swipe right -> previous tab
        router.push(tabs[idx - 1].href);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [pathname, router]);

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

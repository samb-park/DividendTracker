import type { ReactNode } from "react";
import Link from "next/link";
import { V2TabNav } from "@/components/v2/v2-tab-nav";
import { V2ThemeToggle } from "@/components/v2/v2-theme-toggle";

export const metadata = {
  title: "COCKPIT — V2",
};

export default function V2Layout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', 'Helvetica Neue', Arial, sans-serif",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      }}
    >
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-3">
            <Link
              href="/v2"
              className="text-sm font-semibold uppercase tracking-[0.18em]"
            >
              COCKPIT
            </Link>
            <span className="hidden text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:inline">
              V2 · ALLOCATION
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <V2TabNav />
            <V2ThemeToggle />
            <Link
              href="/v1"
              className="hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground sm:inline"
              title="Go to legacy v1"
            >
              V1 →
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

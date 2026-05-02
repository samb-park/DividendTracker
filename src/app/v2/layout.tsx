import type { ReactNode } from "react";
import Link from "next/link";
import { V2TabNav } from "@/components/v2/v2-tab-nav";

export const metadata = {
  title: "v2 — Allocation Cockpit",
};

export default function V2Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-3">
            <Link href="/v2" className="text-base font-semibold tracking-tight">
              Cockpit
            </Link>
            <span className="hidden text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:inline">
              v2 · allocation
            </span>
          </div>
          <div className="flex items-center gap-3">
            <V2TabNav />
            <Link
              href="/v1"
              className="hidden text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground sm:inline"
              title="Go to legacy v1"
            >
              v1 →
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";
import { V2TabNav } from "@/components/v2/v2-tab-nav";
import { V2ThemeToggle } from "@/components/v2/v2-theme-toggle";
import "./v2-apple.css";

export const metadata = {
  title: "Cockpit · v2",
};

export default function V2Layout({ children }: { children: ReactNode }) {
  return (
    <div
      className="v2-root min-h-screen"
      data-v2-mode="light"
      style={{
        background: "hsl(var(--background))",
        color: "hsl(var(--foreground))",
      }}
    >
      {/* Theme bootstrap: read dt-v2-theme localStorage early so first paint is correct */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var r=document.currentScript&&document.currentScript.parentElement;if(!r)return;var t=localStorage.getItem('dt-v2-theme');r.setAttribute('data-v2-mode',t==='dark'?'dark':'light');}catch(e){}})();`,
        }}
      />

      <header
        className="sticky top-0 z-30 border-b"
        style={{
          background: "hsla(var(--background) / 0.78)",
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
          borderColor: "hsl(var(--v2-hairline))",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-baseline gap-3">
            <Link
              href="/v2"
              className="v2-display"
              style={{ fontSize: 18, color: "hsl(var(--v2-ink-strong))" }}
            >
              Cockpit
            </Link>
            <span className="v2-fineprint hidden sm:inline">Allocation</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <V2TabNav />
            <V2ThemeToggle />
            <Link
              href="/v1"
              className="v2-caption hidden sm:inline"
              style={{ color: "hsl(var(--v2-action-blue))" }}
              title="Go to legacy v1"
            >
              v1 →
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}

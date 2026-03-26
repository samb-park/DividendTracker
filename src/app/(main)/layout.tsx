import { BottomNav } from "@/components/bottom-nav";
import { PageHeader } from "@/components/page-header";
import { PwaRegister } from "@/components/pwa-register";
import { SignOutButton } from "@/components/sign-out-button";
import { ChartTouchHandler } from "@/components/chart-touch-handler";
import { PullToRefresh } from "@/components/pull-to-refresh";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="flex-shrink-0 border-b border-border px-4 py-3 flex items-center gap-3 safe-top">
        <PageHeader />
        <div className="ml-auto flex items-center gap-2">
          <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <SlidersHorizontal size={16} strokeWidth={1.5} />
          </Link>
          <SignOutButton />
        </div>
      </header>
      <PullToRefresh />
      <main className="app-shell-main px-4 py-5">
        <div className="max-w-[1600px] mx-auto w-full">
          {children}
        </div>
      </main>
      <BottomNav />
      <PwaRegister />
      <ChartTouchHandler />
    </div>
  );
}

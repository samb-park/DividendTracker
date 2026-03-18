import { BottomNav } from "@/components/bottom-nav";
import { PageHeader } from "@/components/page-header";
import { PwaRegister } from "@/components/pwa-register";
import { SignOutButton } from "@/components/sign-out-button";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="flex-shrink-0 border-b border-border px-4 py-3 flex items-center gap-3 safe-top">
        <PageHeader />
        <div className="ml-auto">
          <SignOutButton />
        </div>
      </header>
      <main className="app-shell-main px-4 py-5">
        {children}
      </main>
      <BottomNav />
      <PwaRegister />
    </div>
  );
}

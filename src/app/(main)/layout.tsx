import { BottomNav, DesktopNav } from "@/components/layout/bottom-nav";
import { SearchHeader } from "@/components/layout/search-header";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <DesktopNav />
      <div className="flex-1 flex flex-col">
        <SearchHeader />
        <main className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

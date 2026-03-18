import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { PageHeader } from "@/components/page-header";
import { PwaRegister } from "@/components/pwa-register";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata: Metadata = {
  title: "Dividend Tracker",
  description: "Personal dividend portfolio tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DivTracker",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,    // allow pinch-zoom up to 5× for accessibility
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body>
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
        </div>
        <PwaRegister />
      </body>
    </html>
  );
}

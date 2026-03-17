import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { PwaRegister } from "@/components/pwa-register";

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
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-border px-4 py-3 flex items-center gap-3 flex-shrink-0 safe-top">
            <span className="text-primary font-medium tracking-widest text-sm">▶ PORTFOLIO</span>
            <span className="text-muted-foreground text-xs">TRACKER v2.0</span>
          </header>
          <main className="flex-1 px-4 py-5 pb-24">
            {children}
          </main>
        </div>
        <BottomNav />
        <PwaRegister />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/layout/Navigation";
import { ThemeScript } from "@/components/theme/theme-script";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Portfolio Tracker",
  description: "Personal portfolio tracker for investments",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "InvTracker",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeScript />
        <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50 transition-colors">
          <Navigation />
          <main className="max-w-6xl mx-auto px-4 py-6 pb-24 md:pb-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

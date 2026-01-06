import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/layout/Navigation";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Portfolio Tracker",
  description: "Personal portfolio tracker for investments",
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
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-[#f5f6f8]">
          <Navigation />
          <main className="max-w-6xl mx-auto px-4 py-6 pb-24 md:pb-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./pocket.css";

export const metadata: Metadata = {
  title: "Dividends",
  description: "Forward dividend run-rate — D / W / M / Y",
  // Own manifest so "Add to Home Screen" launches /pocket (not /v1 from the root manifest).
  manifest: "/pocket-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Dividends",
  },
};

export const viewport: Viewport = {
  // Dark-only MDD terminal: the near-black bg also paints iOS Safari's overscroll
  // (rubber-band) area so it matches the page. No light/dark split anymore.
  themeColor: "#0a0c10",
  width: "device-width",
  initialScale: 1,
  // Zoom is LOCKED (user request): an accidental pinch left the surface scaled
  // up, so every drag panned the whole screen sideways. The installed PWA
  // respects maximumScale/userScalable; the app must stay fixed at 1:1.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function PocketLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pocket-root" id="pocket-root">
      {children}
    </div>
  );
}

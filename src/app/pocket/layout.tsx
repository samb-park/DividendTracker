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
  // Light default (grouped gray); the bootstrap script + theme handler flip this
  // to #000 in dark mode so iOS Safari's overscroll (rubber-band) area matches
  // the page, not the global dark theme-color.
  themeColor: "#f2f2f7",
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
    <div className="pocket-root" id="pocket-root" data-pocket-mode="light">
      {/* Theme bootstrap: resolve dt-pocket-theme (system|light|dark) before first
          paint so there is no flash, and sync the theme-color meta for overscroll. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var r=document.currentScript&&document.currentScript.parentElement;if(!r)return;var t=localStorage.getItem('dt-pocket-theme');var dark=t==='dark'||((t==='system'||!t)&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);r.setAttribute('data-pocket-mode',dark?'dark':'light');var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',dark?'#000000':'#f2f2f7');}catch(e){}})();`,
        }}
      />
      {children}
    </div>
  );
}

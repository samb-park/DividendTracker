import type { Metadata } from "next";
import "./pocket.css";

export const metadata: Metadata = {
  title: "Dividends",
  description: "앞으로 받을 배당 — 일/주/월/년 run-rate",
};

export default function PocketLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pocket-root" id="pocket-root" data-pocket-mode="light">
      {/* Theme bootstrap: resolve dt-pocket-theme (system|light|dark) before first
          paint so there is no flash. Mirrors the v2 surface pattern. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var r=document.currentScript&&document.currentScript.parentElement;if(!r)return;var t=localStorage.getItem('dt-pocket-theme');var dark=t==='dark'||((t==='system'||!t)&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);r.setAttribute('data-pocket-mode',dark?'dark':'light');}catch(e){}})();`,
        }}
      />
      {children}
    </div>
  );
}

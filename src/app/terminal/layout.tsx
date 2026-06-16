import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SnapTerminal — Equity Intel",
  description: "Bloomberg-style 고밀도 금융 터미널",
};

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

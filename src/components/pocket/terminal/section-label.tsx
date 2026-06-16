import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Ported from MDD terminal/SectionLabel — hairline-underlined tiny caps label. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "border-b border-hairline pb-1 text-[10px] uppercase tracking-[0.12em] text-text-low",
        className,
      )}
    >
      {children}
    </div>
  );
}

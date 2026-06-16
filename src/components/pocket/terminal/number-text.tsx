import { cn } from "@/lib/utils";
import { pnlClass } from "./format";

export type Intent = "auto" | "pos" | "neg" | "neutral" | "cyan" | "orange" | "warn";

interface NumberTextProps {
  value: string;
  /** sign-colors by this number when intent="auto" */
  rawValue?: number | null;
  intent?: Intent;
  className?: string;
}

const INTENT_CLASS: Record<string, string> = {
  pos: "text-pos",
  neg: "text-neg",
  neutral: "text-text-hi",
  cyan: "text-accent-cyan",
  orange: "text-accent-orange",
  warn: "text-warn",
};

/** Ported from MDD terminal/NumberText — mono tabular figure with intent color. */
export function NumberText({ value, rawValue, intent = "neutral", className }: NumberTextProps) {
  const color = intent === "auto" ? pnlClass(rawValue) : INTENT_CLASS[intent];
  return <span className={cn("font-mono tabular-nums", color, className)}>{value}</span>;
}

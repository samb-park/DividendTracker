import { cn } from "@/lib/utils";
import { NumberText, type Intent } from "./number-text";

interface MetricCellProps {
  label: string;
  value: string;
  rawValue?: number | null;
  intent?: Intent;
  size?: "sm" | "lg" | "hero";
  sub?: string;
  className?: string;
}

const VALUE_SIZE: Record<string, string> = {
  sm: "text-sm",
  lg: "text-xl",
  hero: "text-3xl font-bold",
};

/** Ported from MDD terminal/MetricCell — tiny uppercase label + mono value (+sub). */
export function MetricCell({
  label,
  value,
  rawValue,
  intent = "neutral",
  size = "sm",
  sub,
  className,
}: MetricCellProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="truncate text-[10px] uppercase tracking-[0.12em] text-text-mid">{label}</span>
      <NumberText
        value={value}
        rawValue={rawValue}
        intent={intent}
        className={cn(VALUE_SIZE[size], "leading-tight")}
      />
      {sub && <span className="truncate font-mono text-[10px] text-text-low">{sub}</span>}
    </div>
  );
}

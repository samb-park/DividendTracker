import type { HTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>;
}

export function Card({ className, ref, ...props }: CardProps) {
  return (
    <div
      ref={ref}
      className={cn("rounded-lg border border-border bg-card p-4", className)}
      {...props}
    />
  );
}

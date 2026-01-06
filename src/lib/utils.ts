import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  const formatted = new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  const sign = value < 0 ? "-" : "";
  return `${sign}$${formatted}`;
}

export function formatNumber(value: number, decimals: number = 4): string {
  return new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// Format with up to maxDecimals but remove trailing zeros
export function formatNumberTrim(value: number, maxDecimals: number = 4): string {
  const formatted = value.toFixed(maxDecimals);
  // Remove trailing zeros completely (including all decimals if zeros)
  const trimmed = parseFloat(formatted).toString();
  const parts = trimmed.split(".");
  if (parts.length === 1) {
    // Integer - no decimal places
    return new Intl.NumberFormat("en-CA").format(value);
  }
  // Has decimals - show only necessary decimal places
  return new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: parts[1].length,
    maximumFractionDigits: parts[1].length,
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-CA");
}

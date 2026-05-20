export const COLOR_ACTUAL = "hsl(142, 69%, 58%)";
export const COLOR_PROJECTED = "hsl(220, 9%, 55%)";
export const COLOR_SELECTED = "hsl(38, 92%, 55%)";

export const RETRO_TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0",
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: "11px",
  color: "hsl(var(--foreground))",
} as const;

export const ALLOCATION_COLORS = [
  COLOR_ACTUAL,
  COLOR_SELECTED,
  "hsl(196, 80%, 60%)",
  "hsl(270, 60%, 65%)",
  "hsl(0, 70%, 70%)",
  "hsl(180, 60%, 50%)",
  "hsl(60, 70%, 55%)",
  "hsl(320, 60%, 65%)",
] as const;

export const GAP_OVERWEIGHT_COLOR = "hsl(45, 100%, 60%)";
export const GAP_UNDERWEIGHT_COLOR = "hsl(210, 80%, 60%)";
export const GAP_BALANCED_COLOR = COLOR_ACTUAL;

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'IBM Plex Mono'", "Courier New", "monospace"],
        sans: ["'IBM Plex Mono'", "Courier New", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        positive: "hsl(var(--positive))",
        negative: "hsl(var(--negative))",

        // MDD Bloomberg terminal palette (hex literals, additive — these new color
        // names don't touch the global shadcn theme above). Used by the ported
        // /pocket terminal components (Panel/DenseTable/MetricCell/NumberText) so
        // their classes resolve: bg-bg, bg-panel, bg-panel-header, bg-inset,
        // border-border-bright, text-text-hi/mid/low, text-accent-cyan/orange,
        // text-pos/neg/warn, bg-accent-cyan/5, etc.
        bg: "#0a0c10",
        panel: "#11141a",
        "panel-header": "#171c24",
        inset: "#0d1015",
        hairline: "#262d38",
        "border-bright": "#3b4554",
        gridline: "#1c222c",
        "text-hi": "#e6edf3",
        "text-mid": "#8b97a5",
        "text-low": "#525e6d",
        pos: "#00d26a",
        neg: "#ff4d4d",
        warn: "#ffb020",
        info: "#5b8def",
        "accent-cyan": "#00e5ff",
        "accent-orange": "#ff8c1a",
        "status-normal": "#5b8def",
        "status-watch": "#ffd60a",
        "status-buyzone": "#00d26a",
        "status-strongbuy": "#ff8c1a",
        "status-extreme": "#ff2d78",
      },
      borderRadius: {
        lg: "2px",
        md: "2px",
        sm: "1px",
        DEFAULT: "2px",
      },
    },
  },
  plugins: [],
};

export default config;

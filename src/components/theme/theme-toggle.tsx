"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "dividend-theme";

function applyTheme(theme: ThemeMode) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && systemDark);
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("system");

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) || "system";
    setTheme(stored);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const current = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) || "system";
      if (current === "system") applyTheme("system");
    };
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  function setMode(next: ThemeMode) {
    setTheme(next);
    applyTheme(next);
  }

  const options: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <div className="inline-flex items-center rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-sm">
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === theme;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setMode(option.value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
              active
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

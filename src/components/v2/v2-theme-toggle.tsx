"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "dark";
const KEY = "dt-v2-theme";

function readMode(): Mode {
  if (typeof document === "undefined") return "light";
  const root = document.querySelector<HTMLElement>(".v2-root");
  return root?.getAttribute("data-v2-mode") === "dark" ? "dark" : "light";
}

function applyMode(m: Mode) {
  if (typeof document === "undefined") return;
  const root = document.querySelector<HTMLElement>(".v2-root");
  if (root) root.setAttribute("data-v2-mode", m);
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* ignore */
  }
}

export function V2ThemeToggle() {
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    setMode(readMode());
  }, []);

  const toggle = () => {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyMode(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      aria-label="Toggle theme"
      className="v2-btn-ghost"
      style={{
        height: 32,
        width: 32,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
      }}
    >
      <span aria-hidden>{mode === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}

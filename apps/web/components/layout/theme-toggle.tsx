"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  const label = mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : "Choose theme";

  return (
    <button
      aria-label={label}
      className="theme-toggle"
      disabled={!mounted}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      type="button"
    >
      {mounted ? (isDark ? "Light" : "Dark") : "Theme"}
    </button>
  );
}

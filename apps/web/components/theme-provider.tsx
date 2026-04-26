"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";
type Density = "comfort" | "compact";
type Accent = "violet" | "blue" | "green" | "amber" | "rose";

const ACCENT_TOKENS: Record<Accent, { accent: string; soft: string; ring: string }> = {
  violet: {
    accent: "oklch(0.55 0.16 285)",
    soft: "oklch(0.92 0.04 285)",
    ring: "oklch(0.55 0.16 285 / 0.18)",
  },
  blue: {
    accent: "oklch(0.6 0.14 240)",
    soft: "oklch(0.93 0.04 240)",
    ring: "oklch(0.6 0.14 240 / 0.18)",
  },
  green: {
    accent: "oklch(0.55 0.13 155)",
    soft: "oklch(0.93 0.05 155)",
    ring: "oklch(0.55 0.13 155 / 0.18)",
  },
  amber: {
    accent: "oklch(0.62 0.14 65)",
    soft: "oklch(0.94 0.06 65)",
    ring: "oklch(0.62 0.14 65 / 0.18)",
  },
  rose: {
    accent: "oklch(0.62 0.16 15)",
    soft: "oklch(0.94 0.04 15)",
    ring: "oklch(0.62 0.16 15 / 0.18)",
  },
};

interface ThemeContextValue {
  theme: Theme;
  density: Density;
  accent: Accent;
  toggleTheme: () => void;
  setDensity: (d: Density) => void;
  setAccent: (a: Accent) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [density, setDensityState] = useState<Density>("comfort");
  const [accent, setAccentState] = useState<Accent>("violet");

  // Apply changes to <html> via data attributes — picked up by tokens.css
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = theme;
    html.dataset.density = density;
    const tokens = ACCENT_TOKENS[accent];
    html.style.setProperty("--accent", tokens.accent);
    html.style.setProperty("--accent-soft", tokens.soft);
    html.style.setProperty("--accent-ring", tokens.ring);
  }, [theme, density, accent]);

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === "light" ? "dark" : "light")),
    [],
  );

  return (
    <ThemeContext.Provider
      value={{
        theme,
        density,
        accent,
        toggleTheme,
        setDensity: setDensityState,
        setAccent: setAccentState,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

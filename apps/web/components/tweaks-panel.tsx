"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { useTheme } from "@/components/theme-provider";

const ACCENTS = [
  { id: "violet", color: "oklch(0.55 0.16 285)" },
  { id: "blue", color: "oklch(0.6 0.14 240)" },
  { id: "green", color: "oklch(0.55 0.13 155)" },
  { id: "amber", color: "oklch(0.62 0.14 65)" },
  { id: "rose", color: "oklch(0.62 0.16 15)" },
] as const;

export function TweaksPanel() {
  const { theme, density, accent, toggleTheme, setDensity, setAccent } = useTheme();
  const [open, setOpen] = useState(true);

  return (
    <>
      {/* Toggle button — bottom-right when panel is closed */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn sm"
          style={{
            position: "fixed",
            right: 18,
            bottom: 18,
            zIndex: 50,
            boxShadow: "var(--shadow-md)",
          }}
        >
          ⚙ Tweaks
        </button>
      )}

      <div className="tweaks" data-open={open ? "true" : "false"}>
        <div className="tweaks-head">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>⚙</span>
            Tweaks
          </span>
          <button
            type="button"
            className="close"
            onClick={() => setOpen(false)}
            aria-label="Fermer"
          >
            <X size={14} strokeWidth={1.7} />
          </button>
        </div>

        <div className="tweaks-body">
          {/* Accent */}
          <div className="tweak-row">
            <div className="tweak-label">Accent</div>
            <div className="swatches">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`swatch${accent === a.id ? " active" : ""}`}
                  style={{ background: a.color }}
                  onClick={() => setAccent(a.id)}
                  aria-label={`Accent ${a.id}`}
                />
              ))}
            </div>
          </div>

          {/* Theme */}
          <div className="tweak-row">
            <div className="tweak-label">Thème</div>
            <div className="segmented">
              <button
                type="button"
                className={theme === "light" ? "active" : ""}
                onClick={() => theme === "dark" && toggleTheme()}
              >
                ☀ Clair
              </button>
              <button
                type="button"
                className={theme === "dark" ? "active" : ""}
                onClick={() => theme === "light" && toggleTheme()}
              >
                ☾ Sombre
              </button>
            </div>
          </div>

          {/* Density */}
          <div className="tweak-row">
            <div className="tweak-label">Densité</div>
            <div className="segmented">
              <button
                type="button"
                className={density === "comfort" ? "active" : ""}
                onClick={() => setDensity("comfort")}
              >
                Confort
              </button>
              <button
                type="button"
                className={density === "compact" ? "active" : ""}
                onClick={() => setDensity("compact")}
              >
                Compact
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

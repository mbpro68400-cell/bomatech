"use client";

import { Search, Bell, Sun, Moon, Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/theme-provider";

const CRUMBS: Record<string, string> = {
  "/dashboard": "Tableau de bord",
  "/imports": "Imports",
  "/transactions": "Transactions",
  "/analytics": "Analytics",
  "/simulate": "Simulation",
  "/insights": "Alertes & insights",
  "/closing": "Avant-clôture",
  "/export": "Export comptable",
  "/settings": "Paramètres",
};

export function Topbar() {
  const pathname = usePathname();
  const current = CRUMBS[pathname ?? ""] ?? "";
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Nova Studio</span>
        <span className="sep">/</span>
        <strong>{current}</strong>
      </div>

      <div className="topbar-right">
        <div className="search" role="search">
          <Search size={14} strokeWidth={1.7} />
          <span>Rechercher…</span>
          <span className="kbd">⌘K</span>
        </div>
        <button type="button" className="btn icon ghost" aria-label="Notifications">
          <Bell size={15} strokeWidth={1.7} />
        </button>
        <button
          type="button"
          className="btn icon ghost"
          aria-label="Basculer le thème"
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun size={15} strokeWidth={1.7} /> : <Moon size={15} strokeWidth={1.7} />}
        </button>
        <button type="button" className="btn primary sm">
          <Plus size={14} strokeWidth={2} />
          Nouveau
        </button>
      </div>
    </header>
  );
}

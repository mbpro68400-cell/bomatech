"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Download,
  Receipt,
  BarChart3,
  Sparkles,
  Bell,
  CalendarCheck,
  FileSpreadsheet,
  Settings,
  ChevronDown,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  kbd?: string;
  badge?: string;
  dot?: boolean;
};

const PILOTAGE: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, kbd: "G H" },
  { href: "/imports", label: "Imports", icon: Download, kbd: "G I", badge: "2" },
  { href: "/transactions", label: "Transactions", icon: Receipt, kbd: "G T" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, kbd: "G A" },
  { href: "/simulate", label: "Simulation", icon: Sparkles, kbd: "G S" },
  { href: "/insights", label: "Alertes & insights", icon: Bell, kbd: "G N", dot: true },
  { href: "/closing", label: "Avant-clôture", icon: CalendarCheck },
];

const COMPTABLE: NavItem[] = [
  { href: "/export", label: "Export comptable", icon: FileSpreadsheet },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`nav-item${active ? " active" : ""}${item.dot ? " dot-accent" : ""}`}
    >
      <Icon size={15} strokeWidth={1.7} />
      <span className="truncate" style={{ flex: 1 }}>{item.label}</span>
      {item.badge && (
        <span
          className="tag accent"
          style={{ height: 18, padding: "0 6px", fontSize: 10 }}
        >
          {item.badge}
        </span>
      )}
      {item.dot && (
        <span
          className="nav-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--accent)",
          }}
        />
      )}
      {item.kbd && !item.badge && !item.dot && <span className="kbd">{item.kbd}</span>}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar" aria-label="Navigation principale">
      {/* Brand */}
      <div className="brand">
        <div className="brand-mark">B</div>
        <div className="brand-name">Bomatech</div>
        <span className="brand-badge">Beta</span>
      </div>

      {/* PILOTAGE */}
      <div className="nav-section">Pilotage</div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {PILOTAGE.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={pathname?.startsWith(item.href) ?? false}
          />
        ))}
      </nav>

      {/* COMPTABLE */}
      <div className="nav-section">Comptable</div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {COMPTABLE.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={pathname?.startsWith(item.href) ?? false}
          />
        ))}
      </nav>

      {/* Footer — workspace chip */}
      <div className="sidebar-footer">
        <div className="company-chip" role="button" tabIndex={0}>
          <div className="company-avatar">NS</div>
          <div className="company-meta">
            <div className="company-name truncate">Nova Studio</div>
            <div className="company-sub">SAS · Paris</div>
          </div>
          <ChevronDown size={14} strokeWidth={1.7} style={{ color: "var(--fg-subtle)" }} />
        </div>
      </div>
    </aside>
  );
}

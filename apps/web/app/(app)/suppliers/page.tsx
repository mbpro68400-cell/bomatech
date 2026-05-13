"use client";

/**
 * Page Veille fournisseurs (1.9 — P5a).
 *
 * Liste les fournisseurs surveillés de la company courante. Pour chaque
 * fournisseur, affiche son statut greffe + dernière vérification Pappers +
 * un badge compact d'alertes non-traitées (couleur de la sévérité max +
 * total). Clic sur le badge = drawer latéral sans changement de page,
 * pour scanner plusieurs lignes rapidement (cf. décision UX). Clic sur
 * le nom = fiche détail /suppliers/[id] (P5c).
 *
 * Filtre V1 : Statut = toutes / avec alertes non-traitées / sans alertes.
 * Pas d'autres filtres avant qu'un besoin émerge en usage réel.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, ShieldCheck, X } from "lucide-react";

import { listSuppliers } from "@/lib/queries/suppliers";
import { listAlertsForCompany } from "@/lib/queries/supplier-alerts";
import { getCurrentCompanyId } from "@/lib/queries/transactions";
import type {
  Supplier,
  SupplierAlert,
  SupplierAlertEventType,
} from "@/lib/engines/types";

type Filter = "all" | "with_pending" | "without";

interface AlertSummary {
  total: number;
  hasCritical: boolean;
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(s: Supplier["status"]): string {
  switch (s) {
    case "active":
      return "Actif";
    case "cessation":
      return "Cessation";
    case "radiation":
      return "Radié";
    case "unknown":
    default:
      return "Inconnu";
  }
}

function statusTone(s: Supplier["status"]): "success" | "warning" | "danger" | "muted" {
  switch (s) {
    case "active":
      return "success";
    case "cessation":
      return "warning";
    case "radiation":
      return "danger";
    case "unknown":
    default:
      return "muted";
  }
}

function eventLabel(t: SupplierAlertEventType): string {
  switch (t) {
    case "procedure_collective_opened":
      return "Procédure collective ouverte";
    case "procedure_collective_judgment":
      return "Jugement de procédure collective";
    case "cessation":
      return "Cessation d'activité";
    case "radiation":
      return "Radiation du RCS";
    case "dirigeant_change":
      return "Changement de dirigeant";
    case "comptes_published":
      return "Publication des comptes";
    case "address_change":
      return "Changement d'adresse";
    case "naf_change":
      return "Changement de code NAF";
    case "capital_change":
      return "Changement de capital";
    case "legal_form_change":
      return "Changement de forme juridique";
  }
}

function summarizeAlerts(alerts: SupplierAlert[]): AlertSummary {
  let hasCritical = false;
  for (const a of alerts) {
    if (a.severity === "critical") {
      hasCritical = true;
      break;
    }
  }
  return { total: alerts.length, hasCritical };
}

export default function SuppliersPage() {
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [alertsBySupplier, setAlertsBySupplier] = useState<Map<string, SupplierAlert[]>>(
    new Map(),
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [drawerSupplier, setDrawerSupplier] = useState<Supplier | null>(null);

  async function refresh(cid: string) {
    const [sups, alerts] = await Promise.all([
      listSuppliers(cid),
      listAlertsForCompany(cid, { onlyUndismissed: true, limit: 1000 }),
    ]);
    const grouped = new Map<string, SupplierAlert[]>();
    for (const a of alerts) {
      const arr = grouped.get(a.supplier_id) ?? [];
      arr.push(a);
      grouped.set(a.supplier_id, arr);
    }
    setSuppliers(sups);
    setAlertsBySupplier(grouped);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const cid = await getCurrentCompanyId();
      if (cancelled) return;
      setCompanyId(cid);
      if (cid) {
        try {
          await refresh(cid);
        } catch (e) {
          console.error("Failed to load suppliers/alerts:", e);
        }
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    let withPending = 0;
    for (const s of suppliers) {
      if ((alertsBySupplier.get(s.id)?.length ?? 0) > 0) withPending += 1;
    }
    return {
      all: suppliers.length,
      withPending,
      without: suppliers.length - withPending,
    };
  }, [suppliers, alertsBySupplier]);

  const filtered = useMemo(() => {
    return suppliers.filter((s) => {
      const total = alertsBySupplier.get(s.id)?.length ?? 0;
      if (filter === "with_pending") return total > 0;
      if (filter === "without") return total === 0;
      return true;
    });
  }, [suppliers, alertsBySupplier, filter]);

  if (loading) {
    return (
      <div style={{ padding: 24, color: "var(--fg-muted)" }}>
        Chargement des fournisseurs...
      </div>
    );
  }

  if (!companyId) {
    return (
      <div style={{ padding: 24 }}>
        Aucune company associée à votre compte.
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 600 }}>
            Veille fournisseurs
          </h1>
          <p
            style={{
              margin: 0,
              color: "var(--fg-muted)",
              fontSize: "var(--fz-sm)",
            }}
          >
            Surveillance santé juridique de vos fournisseurs clés via Pappers
            et BODACC.
          </p>
        </div>
        <Link href="/suppliers/new" className="btn primary">
          <Plus size={14} />
          Ajouter un fournisseur
        </Link>
      </header>

      {suppliers.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <FilterTabs filter={filter} setFilter={setFilter} counts={counts} />
          <SuppliersTable
            suppliers={filtered}
            alertsBySupplier={alertsBySupplier}
            onOpenAlerts={setDrawerSupplier}
          />
        </>
      )}

      {drawerSupplier && (
        <SupplierAlertsDrawer
          supplier={drawerSupplier}
          alerts={alertsBySupplier.get(drawerSupplier.id) ?? []}
          onClose={() => setDrawerSupplier(null)}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="card"
      style={{
        padding: 48,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: "var(--warm-100)",
          display: "grid",
          placeItems: "center",
          color: "var(--fg-muted)",
        }}
      >
        <ShieldCheck size={24} strokeWidth={1.5} />
      </div>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
        Aucun fournisseur surveillé
      </h2>
      <p
        style={{
          margin: 0,
          color: "var(--fg-muted)",
          fontSize: "var(--fz-sm)",
          maxWidth: 480,
        }}
      >
        Ajoutez un fournisseur clé pour être alerté automatiquement de tout
        changement juridique : procédure collective, cessation d'activité,
        radiation du RCS, changement de dirigeant.
      </p>
      <Link
        href="/suppliers/new"
        className="btn primary"
        style={{ marginTop: 4 }}
      >
        <Plus size={14} />
        Ajouter un fournisseur
      </Link>
    </div>
  );
}

function FilterTabs({
  filter,
  setFilter,
  counts,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  counts: { all: number; withPending: number; without: number };
}) {
  const options: Array<{ id: Filter; label: string; count: number }> = [
    { id: "all", label: "Tous", count: counts.all },
    {
      id: "with_pending",
      label: "Avec alertes non-traitées",
      count: counts.withPending,
    },
    { id: "without", label: "Sans alertes", count: counts.without },
  ];
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 16,
        borderBottom: "1px solid var(--border)",
      }}
    >
      {options.map((opt) => {
        const active = filter === opt.id;
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={active}
            onClick={() => setFilter(opt.id)}
            style={{
              padding: "8px 12px",
              borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
              color: active ? "var(--fg)" : "var(--fg-muted)",
              fontSize: "var(--fz-sm)",
              fontWeight: active ? 600 : 400,
              marginBottom: -1,
            }}
          >
            {opt.label}{" "}
            <span style={{ opacity: 0.6 }}>({opt.count})</span>
          </button>
        );
      })}
    </div>
  );
}

function SuppliersTable({
  suppliers,
  alertsBySupplier,
  onOpenAlerts,
}: {
  suppliers: Supplier[];
  alertsBySupplier: Map<string, SupplierAlert[]>;
  onOpenAlerts: (s: Supplier) => void;
}) {
  if (suppliers.length === 0) {
    return (
      <p
        style={{
          color: "var(--fg-muted)",
          fontSize: "var(--fz-sm)",
          marginTop: 24,
        }}
      >
        Aucun fournisseur ne correspond à ce filtre.
      </p>
    );
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Nom</th>
          <th>SIREN</th>
          <th>Statut</th>
          <th>Dernière vérification</th>
          <th>Alertes non-traitées</th>
        </tr>
      </thead>
      <tbody>
        {suppliers.map((s) => {
          const summary = summarizeAlerts(alertsBySupplier.get(s.id) ?? []);
          return (
            <tr key={s.id}>
              <td>
                <Link
                  href={`/suppliers/${s.id}`}
                  style={{ color: "var(--fg)", fontWeight: 500 }}
                >
                  {s.name}
                </Link>
              </td>
              <td>
                <code
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--fz-sm)",
                    color: "var(--fg-muted)",
                  }}
                >
                  {s.siren}
                </code>
              </td>
              <td>
                <span className={`tag ${statusTone(s.status)}`}>
                  {statusLabel(s.status)}
                </span>
              </td>
              <td style={{ color: "var(--fg-muted)" }}>
                {formatDateShort(s.last_polled_at)}
              </td>
              <td>
                <AlertBadge
                  summary={summary}
                  onClick={() => onOpenAlerts(s)}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AlertBadge({
  summary,
  onClick,
}: {
  summary: AlertSummary;
  onClick: () => void;
}) {
  if (summary.total === 0) {
    return <span style={{ color: "var(--fg-subtle)" }}>—</span>;
  }
  // Sévérité MAX : si au moins une critical, on affiche danger ; sinon warning.
  // Le détail par sévérité s'affiche dans le drawer (cf. décision UX).
  const tone: "danger" | "warning" = summary.hasCritical ? "danger" : "warning";
  return (
    <button
      onClick={onClick}
      className={`tag ${tone}`}
      aria-label={`${summary.total} alerte${
        summary.total > 1 ? "s" : ""
      } non-traitée${summary.total > 1 ? "s" : ""} — cliquer pour ouvrir`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        height: 24,
        padding: "0 10px",
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: tone === "danger" ? "var(--danger)" : "var(--warning)",
        }}
      />
      {summary.total}
    </button>
  );
}

function SupplierAlertsDrawer({
  supplier,
  alerts,
  onClose,
}: {
  supplier: Supplier;
  alerts: SupplierAlert[];
  onClose: () => void;
}) {
  const sorted = useMemo(
    () =>
      [...alerts].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [alerts],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.32)",
          zIndex: 50,
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Alertes de ${supplier.name}`}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "min(420px, 95vw)",
          height: "100vh",
          background: "var(--bg-elev)",
          borderLeft: "1px solid var(--border)",
          zIndex: 51,
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <header
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                margin: "0 0 4px",
                fontSize: 16,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {supplier.name}
            </h3>
            <p
              style={{
                margin: 0,
                color: "var(--fg-muted)",
                fontSize: "var(--fz-sm)",
              }}
            >
              SIREN {supplier.siren} · {sorted.length} alerte
              {sorted.length > 1 ? "s" : ""} non-traitée
              {sorted.length > 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer le panneau"
            className="btn ghost icon sm"
            style={{ flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {sorted.length === 0 ? (
            <p style={{ color: "var(--fg-muted)" }}>
              Aucune alerte non-traitée.
            </p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {sorted.map((a) => (
                <li
                  key={a.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 12,
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      marginTop: 6,
                      background:
                        a.severity === "critical"
                          ? "var(--danger)"
                          : "var(--warning)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "var(--fz-sm)",
                        fontWeight: 500,
                        marginBottom: 2,
                      }}
                    >
                      {eventLabel(a.event_type)}
                    </div>
                    <div
                      style={{
                        color: "var(--fg-muted)",
                        fontSize: "var(--fz-xs)",
                      }}
                    >
                      Détecté le {formatDateShort(a.created_at)}
                      {a.severity === "info" ? " · information" : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer
          style={{
            padding: 16,
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <Link
            href={`/suppliers/${supplier.id}`}
            className="btn"
            style={{ fontSize: "var(--fz-sm)" }}
          >
            Voir la fiche complète →
          </Link>
        </footer>
      </aside>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Inbox } from "lucide-react";
import { getCurrentCompanyId, listTransactions } from "@/lib/queries/transactions";
import type { Transaction, TxKind } from "@/lib/engines/types";

type Filter = "all" | "revenue" | "charges" | "tax";

function formatAmount(cents: number) {
  const sign = cents >= 0 ? "+" : "−";
  const abs = Math.abs(cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return `${sign} ${abs} €`;
}

function formatDate(iso: string) {
  // ISO YYYY-MM-DD → "DD mois" (e.g. "15 nov.")
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function categoryLabel(tx: Transaction): string {
  return tx.category ?? kindFallback(tx.kind);
}

function kindFallback(kind: TxKind): string {
  switch (kind) {
    case "revenue": return "revenu";
    case "cost_var": return "variable";
    case "cost_fix": return "fixe";
    case "tax": return "taxe";
    case "capex": return "capex";
    case "financial": return "financier";
    default: return "autre";
  }
}

function matchesFilter(tx: Transaction, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "revenue") return tx.kind === "revenue";
  if (f === "charges") return tx.kind === "cost_var" || tx.kind === "cost_fix";
  if (f === "tax") return tx.kind === "tax";
  return true;
}

export default function TransactionsPage() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const companyId = await getCurrentCompanyId();
      if (!companyId) {
        if (!cancelled) setLoading(false);
        return;
      }
      const data = await listTransactions(companyId, 1000);
      if (!cancelled) {
        setTransactions(data);
        setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(
    () => transactions.filter((tx) => matchesFilter(tx, filter)),
    [transactions, filter],
  );

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 32 }}>
        <Loader2 size={20} strokeWidth={1.7} className="spin" />
        <span className="muted">Chargement des transactions...</span>
        <style jsx>{`
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="serif">Transactions</h1>
          <p>{transactions.length} mouvement{transactions.length > 1 ? "s" : ""}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn ghost sm">Filtrer</button>
          <button type="button" className="btn primary sm">+ Nouvelle</button>
        </div>
      </header>

      {transactions.length === 0 ? (
        <article className="card">
          <div className="card-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 48 }}>
            <Inbox size={36} strokeWidth={1.5} style={{ color: "var(--fg-muted)" }} />
            <h3 className="serif" style={{ margin: 0, fontSize: 20, letterSpacing: "-0.02em" }}>
              Aucune transaction
            </h3>
            <p className="muted" style={{ fontSize: 14, margin: 0, textAlign: "center" }}>
              Importe ton premier extrait bancaire pour commencer.
            </p>
            <a href="/imports" className="btn primary sm" style={{ textDecoration: "none" }}>
              Aller à l'import →
            </a>
          </div>
        </article>
      ) : (
        <article className="card">
          <header className="card-head">
            <div className="segmented">
              <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
                Toutes
              </button>
              <button type="button" className={filter === "revenue" ? "active" : ""} onClick={() => setFilter("revenue")}>
                Revenus
              </button>
              <button type="button" className={filter === "charges" ? "active" : ""} onClick={() => setFilter("charges")}>
                Charges
              </button>
              <button type="button" className={filter === "tax" ? "active" : ""} onClick={() => setFilter("tax")}>
                Taxes
              </button>
            </div>
            <span className="card-sub" style={{ marginLeft: "auto" }}>
              {filtered.length} affichée{filtered.length > 1 ? "s" : ""}
            </span>
          </header>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Libellé</th>
                <th>Tiers</th>
                <th>Catégorie</th>
                <th className="num">Montant</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => (
                <tr key={tx.id}>
                  <td className="mono" style={{ color: "var(--fg-muted)" }}>{formatDate(tx.date)}</td>
                  <td><strong style={{ fontWeight: 500 }}>{tx.label}</strong></td>
                  <td className="muted">{tx.counterparty ?? "—"}</td>
                  <td>
                    <span className={`tag ${tx.kind === "revenue" ? "success" : "muted"}`}>
                      {categoryLabel(tx)}
                    </span>
                  </td>
                  <td
                    className="num mono"
                    style={{ color: tx.amount_cents >= 0 ? "var(--success)" : "var(--fg)" }}
                  >
                    {formatAmount(tx.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}
    </>
  );
}

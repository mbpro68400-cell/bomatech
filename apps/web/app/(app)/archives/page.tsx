"use client";

/**
 * Phase 1.7 — Archives (lecture seule).
 *
 * Affiche les transactions et factures avec is_closed_period=true. Lecture
 * seule à 100 % : aucune action de modification ou suppression. Si l'user
 * essaye via la console ou un autre moyen, la mutation sera bloquée par les
 * RLS policies + le trigger PG prevent_modify_archived. UI sans actions = UX.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Archive, Receipt, FileText } from "lucide-react";
import { getCurrentCompanyId, listTransactions } from "@/lib/queries/transactions";
import { listInvoices } from "@/lib/queries/invoices";
import type { Invoice, Transaction } from "@/lib/engines/types";

type Tab = "transactions" | "invoices";

function formatEur(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ArchivesPage() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("transactions");
  const [archivedTx, setArchivedTx] = useState<Transaction[]>([]);
  const [archivedInv, setArchivedInv] = useState<Invoice[]>([]);
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const cid = await getCurrentCompanyId();
      if (cancelled) return;
      if (!cid) {
        setLoading(false);
        return;
      }
      // includeClosed=true to fetch open+closed, then filter to ONLY closed for archives.
      const [txs, invs] = await Promise.all([
        listTransactions(cid, 5000, { includeClosed: true }),
        listInvoices(cid, 5000, { includeClosed: true }),
      ]);
      if (!cancelled) {
        setArchivedTx(txs.filter((t) => t.is_closed_period === true));
        setArchivedInv(invs.filter((i) => i.is_closed_period === true));
        setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const filteredTx = useMemo(() => {
    if (!search.trim()) return archivedTx;
    const s = search.toLowerCase();
    return archivedTx.filter((t) =>
      t.label.toLowerCase().includes(s) ||
      (t.counterparty ?? "").toLowerCase().includes(s) ||
      t.date.includes(s),
    );
  }, [archivedTx, search]);

  const filteredInv = useMemo(() => {
    if (!search.trim()) return archivedInv;
    const s = search.toLowerCase();
    return archivedInv.filter((i) =>
      i.number.toLowerCase().includes(s) ||
      i.client_name.toLowerCase().includes(s) ||
      i.issued_at.includes(s),
    );
  }, [archivedInv, search]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 32 }}>
        <Loader2 size={20} strokeWidth={1.7} className="spin" />
        <span className="muted">Chargement des archives...</span>
        <style jsx>{`
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  const totalCount = archivedTx.length + archivedInv.length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="serif">Archives</h1>
          <p>
            Écritures de périodes closes en lecture seule.
            <br />
            <span className="muted" style={{ fontSize: 12 }}>
              {totalCount === 0
                ? "Aucune écriture archivée. Une clôture est nécessaire pour archiver des écritures."
                : `${archivedTx.length} transaction${archivedTx.length > 1 ? "s" : ""} et ${archivedInv.length} facture${archivedInv.length > 1 ? "s" : ""} en archive.`}
            </span>
          </p>
        </div>
      </header>

      {totalCount === 0 ? (
        <article className="card">
          <div className="card-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 48 }}>
            <Archive size={36} strokeWidth={1.5} style={{ color: "var(--fg-muted)" }} />
            <h3 className="serif" style={{ margin: 0, fontSize: 20, letterSpacing: "-0.02em" }}>
              Aucune écriture archivée
            </h3>
            <p className="muted" style={{ fontSize: 14, margin: 0, textAlign: "center" }}>
              Les écritures sont archivées au moment de la clôture d'une période.
              <br />
              Voir <a href="/periods" style={{ textDecoration: "underline" }}>Périodes comptables</a> pour clôturer.
            </p>
          </div>
        </article>
      ) : (
        <>
          <article className="card" style={{ marginBottom: 12 }}>
            <header className="card-head">
              <div className="segmented">
                <button type="button" className={tab === "transactions" ? "active" : ""} onClick={() => setTab("transactions")}>
                  <Receipt size={12} strokeWidth={1.7} /> Transactions ({archivedTx.length})
                </button>
                <button type="button" className={tab === "invoices" ? "active" : ""} onClick={() => setTab("invoices")}>
                  <FileText size={12} strokeWidth={1.7} /> Factures ({archivedInv.length})
                </button>
              </div>
              <input
                type="text"
                placeholder="Rechercher (libellé, client, date YYYY-MM-DD)…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ marginLeft: "auto", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", color: "var(--fg)", font: "inherit", fontSize: 13, width: 280 }}
              />
            </header>
            <div className="card-body" style={{ padding: 0 }}>
              {tab === "transactions" ? (
                filteredTx.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--fg-muted)" }}>
                    Aucun résultat pour "{search}"
                  </div>
                ) : (
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
                      {filteredTx.map((tx) => (
                        <tr key={tx.id}>
                          <td className="mono muted" style={{ whiteSpace: "nowrap" }}>{formatDate(tx.date)}</td>
                          <td>{tx.label}</td>
                          <td className="muted">{tx.counterparty ?? "—"}</td>
                          <td>
                            <span className="tag muted">{tx.category ?? tx.kind}</span>
                          </td>
                          <td className="num mono" style={{ color: tx.amount_cents >= 0 ? "var(--success)" : "var(--fg)" }}>
                            {tx.amount_cents >= 0 ? "+" : "−"} {formatEur(Math.abs(tx.amount_cents))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (
                filteredInv.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--fg-muted)" }}>
                    Aucun résultat pour "{search}"
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Client</th>
                        <th>Émise</th>
                        <th>Statut</th>
                        <th className="num">TTC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInv.map((inv) => (
                        <tr key={inv.id}>
                          <td className="mono"><strong style={{ fontWeight: 500 }}>{inv.number}</strong></td>
                          <td>{inv.client_name}</td>
                          <td className="mono muted" style={{ whiteSpace: "nowrap" }}>{formatDate(inv.issued_at)}</td>
                          <td>
                            <span className={`tag ${inv.status === "paid" ? "success" : "muted"}`}>
                              {inv.status === "paid" ? "Payée" : inv.status === "cancelled" ? "Annulée" : "À payer"}
                            </span>
                          </td>
                          <td className="num mono">{formatEur(inv.amount_ttc_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </article>
          <p className="muted" style={{ fontSize: 11, textAlign: "center", marginTop: 8 }}>
            Lecture seule. Toute tentative de modification ou suppression est bloquée au niveau base de données.
          </p>
        </>
      )}

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

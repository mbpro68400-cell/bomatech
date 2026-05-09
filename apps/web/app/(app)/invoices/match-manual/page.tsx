"use client";

/**
 * Phase 6 : rapprochement manuel multi-factures.
 *
 * V1 SCOPE NOTICE
 * ----------------
 * Cas couvert : 1 transaction bancaire (virement consolidé) qui paie N factures.
 * Cas non couvert V1 : 1 facture payée en plusieurs virements (paiement partiel
 * / échelonné) — V2 via la table invoice_payments. Voir migration 0002 + ROADMAP.
 *
 * Validation : la somme des factures cochées doit être à ±1 % du montant de la
 * transaction sélectionnée (même tolérance que l'auto-match V1).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { applyManualMultiMatch, listInvoices } from "@/lib/queries/invoices";
import { getCurrentCompanyId, listTransactions } from "@/lib/queries/transactions";
import { getBrowserClient } from "@/lib/supabase";
import type { Invoice, Transaction } from "@/lib/engines/types";

const AMOUNT_TOLERANCE = 0.01;

function formatEur(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ManualMatchPage() {
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  async function refresh(cid: string) {
    const [invs, txs] = await Promise.all([
      listInvoices(cid, 1000),
      listTransactions(cid, 5000),
    ]);
    setInvoices(invs);
    setTransactions(txs);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const cid = await getCurrentCompanyId();
      if (cancelled) return;
      const sb = getBrowserClient();
      const { data: session } = await sb.auth.getSession();
      const uid = session.session?.user?.id ?? null;
      setCompanyId(cid);
      setUserId(uid);
      if (cid) await refresh(cid);
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  // Compute available transactions (revenue, NOT already attributed to any invoice)
  const availableTxs = useMemo(() => {
    const usedTxIds = new Set<string>();
    for (const inv of invoices) {
      if (inv.matched_transaction_id) usedTxIds.add(inv.matched_transaction_id);
    }
    return transactions
      .filter((tx) => tx.kind === "revenue" && tx.amount_cents > 0 && !usedTxIds.has(tx.id))
      .sort((a, b) => b.date.localeCompare(a.date)); // most recent first
  }, [invoices, transactions]);

  // Compute available invoices (pending, not already matched)
  const availableInvoices = useMemo(() => {
    return invoices
      .filter((inv) => inv.status === "pending" && !inv.matched_transaction_id)
      .sort((a, b) => a.due_at.localeCompare(b.due_at)); // oldest due first
  }, [invoices]);

  const selectedTx = transactions.find((t) => t.id === selectedTxId) ?? null;
  const selectedInvoices = invoices.filter((i) => selectedInvoiceIds.has(i.id));
  const selectedInvoicesTotal = selectedInvoices.reduce((s, i) => s + i.amount_ttc_cents, 0);
  const txAmount = selectedTx?.amount_cents ?? 0;
  const delta = selectedInvoicesTotal - txAmount;
  const deltaPct = txAmount > 0 ? Math.abs(delta) / txAmount : 1;
  const inTolerance = txAmount > 0 && deltaPct <= AMOUNT_TOLERANCE;
  const canSubmit = !!selectedTxId && selectedInvoiceIds.size > 0 && inTolerance && !submitting;

  function toggleInvoice(id: string) {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!canSubmit || !selectedTx || !companyId) return;
    setSubmitting(true);
    setErrorMessage("");
    setResultMessage("");
    const ids = [...selectedInvoiceIds];
    const { updated, error } = await applyManualMultiMatch(ids, selectedTx.id, userId, selectedTx.date);
    setSubmitting(false);
    if (error) {
      setErrorMessage(error);
      return;
    }
    setResultMessage(`${updated} facture${updated > 1 ? "s" : ""} rapprochée${updated > 1 ? "s" : ""} avec la transaction du ${formatDate(selectedTx.date)}.`);
    setSelectedTxId(null);
    setSelectedInvoiceIds(new Set());
    await refresh(companyId);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 32 }}>
        <Loader2 size={20} strokeWidth={1.7} className="spin" />
        <span className="muted">Chargement...</span>
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
          <h1 className="serif">Rapprochement manuel</h1>
          <p>
            1 transaction bancaire ↔ N factures. Utile quand un virement consolidé paie plusieurs factures.
            <br />
            <span className="muted" style={{ fontSize: 12 }}>
              Validation : écart ≤ 1 % entre la somme des factures cochées et le montant de la transaction.
            </span>
          </p>
        </div>
        <div className="actions">
          <Link href="/invoices/suggestions" className="btn ghost sm" style={{ textDecoration: "none" }}>
            <ArrowLeft size={14} strokeWidth={1.7} /> Suggestions auto
          </Link>
        </div>
      </header>

      {resultMessage && (
        <article className="card" style={{ marginBottom: 12, borderColor: "var(--success)" }}>
          <div className="card-body" style={{ padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle2 size={20} strokeWidth={1.7} color="var(--success)" />
            <span style={{ fontSize: 13 }}>{resultMessage}</span>
          </div>
        </article>
      )}

      {errorMessage && (
        <article className="card" style={{ marginBottom: 12, borderColor: "var(--danger)" }}>
          <div className="card-body" style={{ padding: 14, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <AlertCircle size={20} strokeWidth={1.7} color="var(--danger)" />
            <span style={{ fontSize: 13 }}>{errorMessage}</span>
          </div>
        </article>
      )}

      <div className="grid cols-2" style={{ gap: 12 }}>
        {/* Colonne gauche : transactions */}
        <article className="card">
          <header className="card-head">
            <div className="card-title">1. Choisis la transaction</div>
            <span className="card-sub" style={{ marginLeft: 8 }}>{availableTxs.length} disponible{availableTxs.length > 1 ? "s" : ""}</span>
          </header>
          <div className="card-body" style={{ padding: 0, maxHeight: 480, overflowY: "auto" }}>
            {availableTxs.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--fg-muted)" }}>
                Aucune transaction revenue disponible. Toutes sont déjà attribuées ou tu n'as pas encore importé d'extraits bancaires.
              </div>
            ) : (
              <table className="table">
                <tbody>
                  {availableTxs.map((tx) => (
                    <tr key={tx.id} onClick={() => setSelectedTxId(tx.id)} style={{ cursor: "pointer", background: selectedTxId === tx.id ? "var(--accent-soft)" : undefined }}>
                      <td style={{ width: 30 }}>
                        <input type="radio" name="tx" checked={selectedTxId === tx.id} onChange={() => setSelectedTxId(tx.id)} />
                      </td>
                      <td className="mono muted" style={{ whiteSpace: "nowrap" }}>{formatDate(tx.date)}</td>
                      <td style={{ fontSize: 12 }}>{tx.label.slice(0, 50)}</td>
                      <td className="num mono" style={{ whiteSpace: "nowrap" }}>{formatEur(tx.amount_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </article>

        {/* Colonne droite : factures */}
        <article className="card">
          <header className="card-head">
            <div className="card-title">2. Coche les factures à rapprocher</div>
            <span className="card-sub" style={{ marginLeft: 8 }}>{selectedInvoiceIds.size}/{availableInvoices.length} sélectionnée{selectedInvoiceIds.size > 1 ? "s" : ""}</span>
          </header>
          <div className="card-body" style={{ padding: 0, maxHeight: 480, overflowY: "auto" }}>
            {availableInvoices.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--fg-muted)" }}>
                Aucune facture pending non-rapprochée.
              </div>
            ) : (
              <table className="table">
                <tbody>
                  {availableInvoices.map((inv) => (
                    <tr key={inv.id} onClick={() => toggleInvoice(inv.id)} style={{ cursor: "pointer", background: selectedInvoiceIds.has(inv.id) ? "var(--accent-soft)" : undefined }}>
                      <td style={{ width: 30 }}>
                        <input type="checkbox" checked={selectedInvoiceIds.has(inv.id)} onChange={() => toggleInvoice(inv.id)} />
                      </td>
                      <td className="mono"><strong>{inv.number}</strong></td>
                      <td style={{ fontSize: 12 }}>{inv.client_name}</td>
                      <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 12 }}>{formatDate(inv.due_at)}</td>
                      <td className="num mono" style={{ whiteSpace: "nowrap" }}>{formatEur(inv.amount_ttc_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </article>
      </div>

      {/* Status bar */}
      <article className="card" style={{ marginTop: 12, borderColor: inTolerance ? "var(--success)" : selectedTxId ? "var(--warning)" : undefined }}>
        <div className="card-body" style={{ padding: 14, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, display: "flex", gap: 18, fontSize: 13, flexWrap: "wrap" }}>
            <span><span className="muted">Σ factures :</span> <strong>{formatEur(selectedInvoicesTotal)}</strong></span>
            <span><span className="muted">Tx :</span> <strong>{selectedTx ? formatEur(txAmount) : "—"}</strong></span>
            <span style={{ color: inTolerance ? "var(--success)" : "var(--fg)" }}>
              <span className="muted">Écart :</span> <strong>{selectedTx ? `${formatEur(Math.abs(delta))} (${(deltaPct * 100).toFixed(2)} %)` : "—"}</strong>
            </span>
            {!inTolerance && selectedTx && selectedInvoiceIds.size > 0 && (
              <span style={{ color: "var(--warning)", fontSize: 12 }}>
                ⚠ Écart &gt; 1 %, valider impossible
              </span>
            )}
          </div>
          <button type="button" className="btn primary" onClick={submit} disabled={!canSubmit}>
            {submitting ? <><Loader2 size={14} strokeWidth={1.7} className="spin" /> Rapprochement…</> : <>Valider le rapprochement</>}
          </button>
        </div>
      </article>

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

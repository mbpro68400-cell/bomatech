"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, X, AlertCircle, Link2, ArrowLeft } from "lucide-react";
import {
  confirmSuggestion,
  dismissMatch,
  effectiveStatus,
  listInvoices,
  runMatchingFor,
  type MatchSummary,
} from "@/lib/queries/invoices";
import { getCurrentCompanyId, listTransactions } from "@/lib/queries/transactions";
import { getBrowserClient } from "@/lib/supabase";
import type { MatchResult } from "@/lib/engines/invoice-matching";
import type { Invoice, Transaction } from "@/lib/engines/types";

function formatEur(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatRelative(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin === 1) return "il y a 1 minute";
  if (diffMin < 60) return `il y a ${diffMin} minutes`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH === 1) return "il y a 1 heure";
  if (diffH < 24) return `il y a ${diffH} heures`;
  return date.toLocaleString("fr-FR");
}

export default function SuggestionsPage() {
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [, setTick] = useState(0); // forces a re-render every minute for "il y a X minutes"
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [anomalies, setAnomalies] = useState<MatchResult[]>([]);

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

  // Re-render every minute so "il y a X minutes" stays accurate
  useEffect(() => {
    if (!lastRunAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [lastRunAt]);

  // Section 1 query (per spec):
  //   WHERE status='pending'
  //     AND matched_transaction_id IS NOT NULL
  //     AND match_confidence >= 0.60
  //     AND match_confidence < 0.90
  // Implemented client-side over the loaded list (kept in sync with DB after each run).
  const suggestions = useMemo(
    () =>
      invoices.filter(
        (inv) =>
          inv.status === "pending" &&
          inv.matched_transaction_id != null &&
          inv.match_confidence != null &&
          inv.match_confidence >= 0.6 &&
          inv.match_confidence < 0.9,
      ),
    [invoices],
  );

  const underpayments = anomalies.filter((a) => a.type === "underpayment");
  const overpayments = anomalies.filter((a) => a.type === "overpayment");

  async function relaunch() {
    if (!companyId) return;
    setRunning(true);
    try {
      const { summary: s, anomalies: a } = await runMatchingFor(companyId);
      setSummary(s);
      setAnomalies(a);
      setLastRunAt(new Date());
      await refresh(companyId);
    } finally {
      setRunning(false);
    }
  }

  async function onConfirm(invoice: Invoice) {
    if (!companyId) return;
    const tx = transactions.find((t) => t.id === invoice.matched_transaction_id);
    await confirmSuggestion(invoice.id, userId, tx?.date);
    await refresh(companyId);
  }

  async function onDismiss(invoice: Invoice) {
    if (!companyId) return;
    await dismissMatch(invoice.id);
    await refresh(companyId);
    // The dismissed pair may be re-suggested at next run — known V1 limitation (ROADMAP).
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 32 }}>
        <Loader2 size={20} strokeWidth={1.7} className="spin" />
        <span className="muted">Chargement des suggestions...</span>
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
          <h1 className="serif">Suggestions de rapprochement</h1>
          <p>
            Dernier rapprochement : <strong>{lastRunAt ? formatRelative(lastRunAt) : "jamais lancé sur cette session"}</strong>
            {summary && (
              <>
                {" · "}auto: {summary.auto} · à valider: {summary.suggested} · partiel: {summary.underpayment} · supérieur: {summary.overpayment} · sans candidat: {summary.noCandidate}
              </>
            )}
          </p>
        </div>
        <div className="actions" style={{ flexWrap: "wrap", gap: 6 }}>
          <Link href="/invoices" className="btn ghost sm" style={{ textDecoration: "none" }}>
            <ArrowLeft size={14} strokeWidth={1.7} /> Factures
          </Link>
          <button type="button" className="btn primary sm" onClick={relaunch} disabled={running}>
            {running ? <Loader2 size={14} strokeWidth={1.7} className="spin" /> : <Link2 size={14} strokeWidth={1.7} />}
            {running ? "Rapprochement…" : "Relancer le rapprochement"}
          </button>
        </div>
      </header>

      {/* Section 1 — Suggestions à valider (persistées) */}
      <article className="card" style={{ marginBottom: 16 }}>
        <header className="card-head">
          <div className="card-title">Suggestions à valider</div>
          <span className="card-sub" style={{ marginLeft: 8 }}>{suggestions.length}</span>
        </header>
        <div className="card-body" style={{ padding: 0 }}>
          {suggestions.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
              Aucune suggestion à valider. Lance "Relancer le rapprochement" si tu viens d'importer factures ou transactions.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>Client</th>
                  <th className="num">TTC</th>
                  <th>Transaction proposée</th>
                  <th className="num">Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((inv) => {
                  const tx = transactions.find((t) => t.id === inv.matched_transaction_id);
                  return (
                    <tr key={inv.id}>
                      <td className="mono"><strong style={{ fontWeight: 500 }}>{inv.number}</strong></td>
                      <td>{inv.client_name}</td>
                      <td className="num mono">{formatEur(inv.amount_ttc_cents)}</td>
                      <td>
                        {tx ? (
                          <>
                            <span className="mono muted">{formatDate(tx.date)}</span>
                            <span> · </span>
                            <span>{tx.label.slice(0, 60)}</span>
                            <span> · </span>
                            <span className="mono">{formatEur(tx.amount_cents)}</span>
                          </>
                        ) : (
                          <em className="muted">transaction introuvable</em>
                        )}
                      </td>
                      <td className="num mono">{((inv.match_confidence ?? 0) * 100).toFixed(0)}%</td>
                      <td className="num">
                        <button type="button" className="btn primary sm" onClick={() => onConfirm(inv)} title="Confirmer le match (marquer payée)">
                          <CheckCircle2 size={12} strokeWidth={1.7} /> Confirmer
                        </button>
                        <button type="button" className="btn ghost sm" onClick={() => onDismiss(inv)} title="Ignorer la suggestion" style={{ marginLeft: 4 }}>
                          <X size={12} strokeWidth={1.7} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </article>

      {/* Section 2 — Paiements partiels suspectés (in-memory, du dernier run) */}
      <article className="card" style={{ marginBottom: 16, borderColor: "var(--warning)" }}>
        <header className="card-head">
          <div className="card-title">Paiements partiels suspectés</div>
          <span className="card-sub" style={{ marginLeft: 8 }}>{underpayments.length}</span>
        </header>
        <div className="card-body" style={{ padding: 0 }}>
          {underpayments.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12, color: "var(--fg-muted)" }}>
              Aucun paiement partiel détecté lors du dernier rapprochement. Cette section est volatile : elle ne survit pas à un refresh tant que tu ne relances pas.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>TTC attendu</th>
                  <th>Transaction proposée</th>
                  <th className="num">Écart</th>
                  <th>Motif</th>
                </tr>
              </thead>
              <tbody>
                {underpayments.map((a) => <AnomalyRow key={a.invoiceId} a={a} invoices={invoices} transactions={transactions} />)}
              </tbody>
            </table>
          )}
        </div>
      </article>

      {/* Section 3 — Paiements supérieurs attendus */}
      <article className="card" style={{ marginBottom: 16, borderColor: "var(--danger)" }}>
        <header className="card-head">
          <div className="card-title">Paiements supérieurs attendus</div>
          <span className="card-sub" style={{ marginLeft: 8 }}>{overpayments.length}</span>
        </header>
        <div className="card-body" style={{ padding: 0 }}>
          {overpayments.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12, color: "var(--fg-muted)" }}>
              Aucun trop-perçu détecté lors du dernier rapprochement.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>TTC attendu</th>
                  <th>Transaction proposée</th>
                  <th className="num">Écart</th>
                  <th>Motif</th>
                </tr>
              </thead>
              <tbody>
                {overpayments.map((a) => <AnomalyRow key={a.invoiceId} a={a} invoices={invoices} transactions={transactions} />)}
              </tbody>
            </table>
          )}
        </div>
      </article>

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

function AnomalyRow({ a, invoices, transactions }: { a: MatchResult; invoices: Invoice[]; transactions: Transaction[] }) {
  const inv = invoices.find((i) => i.id === a.invoiceId);
  const tx = transactions.find((t) => t.id === a.transactionId);
  return (
    <tr>
      <td className="mono"><strong style={{ fontWeight: 500 }}>{inv?.number ?? "—"}</strong> · {inv?.client_name ?? ""}</td>
      <td className="mono">{inv ? formatEur(inv.amount_ttc_cents) : ""}</td>
      <td>
        {tx ? (
          <>
            <span className="mono muted">{formatDate(tx.date)}</span>
            <span> · </span>
            <span className="mono">{formatEur(tx.amount_cents)}</span>
          </>
        ) : "—"}
      </td>
      <td className="num mono" style={{ color: a.type === "underpayment" ? "var(--warning)" : "var(--danger)" }}>
        {a.amountDeltaPct != null ? `${(a.amountDeltaPct * 100).toFixed(1)} %` : ""}
      </td>
      <td style={{ fontSize: 12 }}>{a.reason ?? ""}</td>
    </tr>
  );
}

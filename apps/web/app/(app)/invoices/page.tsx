"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Inbox, Plus, X, AlertCircle } from "lucide-react";
import {
  createInvoice,
  deleteInvoice,
  effectiveStatus,
  listInvoices,
  updateInvoiceStatus,
  type EffectiveStatus,
} from "@/lib/queries/invoices";
import { getCurrentCompanyId } from "@/lib/queries/transactions";
import type { Invoice } from "@/lib/engines/types";

type Filter = "all" | "pending" | "overdue" | "paid";

const VAT_RATES = [
  { label: "20 % (taux normal)", value: 0.2 },
  { label: "10 % (intermédiaire)", value: 0.1 },
  { label: "5,5 % (réduit)", value: 0.055 },
  { label: "0 % (exonéré / hors UE)", value: 0 },
];

function formatEur(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function parseEurInput(s: string): number {
  const cleaned = s.replace(/[€\s ]/g, "").replace(",", ".");
  const v = parseFloat(cleaned);
  if (!isFinite(v) || v < 0) return NaN;
  return Math.round(v * 100);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function statusLabel(s: EffectiveStatus): string {
  switch (s) {
    case "pending": return "À payer";
    case "paid": return "Payée";
    case "overdue": return "En retard";
    case "cancelled": return "Annulée";
  }
}

function statusTone(s: EffectiveStatus): string {
  switch (s) {
    case "pending": return "muted";
    case "paid": return "success";
    case "overdue": return "danger";
    case "cancelled": return "muted";
  }
}

function matchesFilter(inv: Invoice, f: Filter, today: string): boolean {
  const eff = effectiveStatus(inv, today);
  if (f === "all") return true;
  return eff === f;
}

interface FormState {
  number: string;
  client_name: string;
  amount_ht_input: string;
  vat_rate: number;
  issued_at: string;
  due_at: string;
  description: string;
}

const emptyForm = (): FormState => ({
  number: "",
  client_name: "",
  amount_ht_input: "",
  vat_rate: 0.2,
  issued_at: todayIso(),
  due_at: plusDaysIso(30),
  description: "",
});

export default function InvoicesPage() {
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>("");
  const [form, setForm] = useState<FormState>(emptyForm());

  const today = todayIso();

  async function refresh(cid: string) {
    const data = await listInvoices(cid, 500);
    setInvoices(data);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const cid = await getCurrentCompanyId();
      if (cancelled) return;
      setCompanyId(cid);
      if (cid) await refresh(cid);
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(
    () => invoices.filter((inv) => matchesFilter(inv, filter, today)),
    [invoices, filter, today],
  );

  // KPIs
  const kpis = useMemo(() => {
    let totalPending = 0;
    let totalOverdue = 0;
    let countOverdue = 0;
    for (const inv of invoices) {
      const eff = effectiveStatus(inv, today);
      if (eff === "pending") totalPending += inv.amount_ttc_cents;
      else if (eff === "overdue") {
        totalOverdue += inv.amount_ttc_cents;
        countOverdue += 1;
      }
    }
    return { totalPending, totalOverdue, countOverdue };
  }, [invoices, today]);

  async function handleSubmit() {
    if (!companyId) return;
    setFormError("");

    if (!form.number.trim() || !form.client_name.trim()) {
      setFormError("Numéro de facture et nom du client sont obligatoires.");
      return;
    }

    const ht = parseEurInput(form.amount_ht_input);
    if (!isFinite(ht) || ht <= 0) {
      setFormError("Montant HT invalide.");
      return;
    }

    const tva = Math.round(ht * form.vat_rate);
    const ttc = ht + tva;

    if (form.due_at < form.issued_at) {
      setFormError("La date d'échéance doit être postérieure (ou égale) à la date d'émission.");
      return;
    }

    setSaving(true);
    const { error } = await createInvoice({
      company_id: companyId,
      number: form.number.trim(),
      client_name: form.client_name.trim(),
      amount_ht_cents: ht,
      amount_tva_cents: tva,
      amount_ttc_cents: ttc,
      vat_rate: form.vat_rate,
      issued_at: form.issued_at,
      due_at: form.due_at,
      description: form.description.trim() || null,
      source: "manual",
    });
    setSaving(false);

    if (error) {
      setFormError(/duplicate key|unique/i.test(error) ? `Numéro de facture déjà utilisé : ${form.number}` : error);
      return;
    }

    setShowForm(false);
    setForm(emptyForm());
    await refresh(companyId);
  }

  async function markPaid(invoice: Invoice) {
    if (!companyId) return;
    await updateInvoiceStatus(invoice.id, "paid");
    await refresh(companyId);
  }

  async function markPending(invoice: Invoice) {
    if (!companyId) return;
    await updateInvoiceStatus(invoice.id, "pending");
    await refresh(companyId);
  }

  async function cancel(invoice: Invoice) {
    if (!companyId) return;
    if (!confirm(`Annuler la facture ${invoice.number} ? Elle restera visible mais marquée annulée.`)) return;
    await updateInvoiceStatus(invoice.id, "cancelled");
    await refresh(companyId);
  }

  async function remove(invoice: Invoice) {
    if (!companyId) return;
    if (!confirm(`Supprimer définitivement la facture ${invoice.number} ?`)) return;
    await deleteInvoice(invoice.id);
    await refresh(companyId);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 32 }}>
        <Loader2 size={20} strokeWidth={1.7} className="spin" />
        <span className="muted">Chargement des factures...</span>
        <style jsx>{`
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // Live preview of TVA / TTC in the form
  const previewHt = parseEurInput(form.amount_ht_input);
  const previewTva = isFinite(previewHt) && previewHt > 0 ? Math.round(previewHt * form.vat_rate) : 0;
  const previewTtc = isFinite(previewHt) && previewHt > 0 ? previewHt + previewTva : 0;

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="serif">Factures émises</h1>
          <p>
            {invoices.length} facture{invoices.length > 1 ? "s" : ""}
            {kpis.totalPending > 0 ? ` · ${formatEur(kpis.totalPending)} à encaisser` : ""}
            {kpis.countOverdue > 0 ? ` · ${formatEur(kpis.totalOverdue)} en retard (${kpis.countOverdue})` : ""}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn primary sm" onClick={() => setShowForm((v) => !v)}>
            <Plus size={14} strokeWidth={2} /> {showForm ? "Annuler" : "Nouvelle facture"}
          </button>
        </div>
      </header>

      {showForm && (
        <article className="card" style={{ marginBottom: 16 }}>
          <header className="card-head">
            <div className="card-title">Saisie manuelle</div>
            <button type="button" className="btn ghost sm" onClick={() => { setShowForm(false); setFormError(""); }} style={{ marginLeft: "auto" }}>
              <X size={14} strokeWidth={1.7} />
            </button>
          </header>
          <div className="card-body" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <Field label="Numéro de facture *">
              <input type="text" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="FAC-2026-001" />
            </Field>
            <Field label="Client *">
              <input type="text" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} placeholder="Nom du client" />
            </Field>
            <Field label="Montant HT (€) *">
              <input type="text" inputMode="decimal" value={form.amount_ht_input} onChange={(e) => setForm({ ...form, amount_ht_input: e.target.value })} placeholder="1500,00" />
            </Field>
            <Field label="Taux de TVA">
              <select value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: parseFloat(e.target.value) })}>
                {VAT_RATES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Date d'émission *">
              <input type="date" value={form.issued_at} onChange={(e) => setForm({ ...form, issued_at: e.target.value })} />
            </Field>
            <Field label="Date d'échéance *">
              <input type="date" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
            </Field>
            <Field label="Description (optionnelle)" full>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Prestation, période..." />
            </Field>

            {previewTtc > 0 && (
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 16, padding: "8px 12px", background: "var(--surface-sunken)", borderRadius: 6, fontSize: 13 }}>
                <span><span className="muted">HT :</span> {formatEur(previewHt)}</span>
                <span><span className="muted">TVA :</span> {formatEur(previewTva)}</span>
                <span><strong>TTC : {formatEur(previewTtc)}</strong></span>
              </div>
            )}

            {formError && (
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", color: "var(--danger)", fontSize: 13 }}>
                <AlertCircle size={16} strokeWidth={1.7} /> {formError}
              </div>
            )}

            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost" onClick={() => { setShowForm(false); setFormError(""); }} disabled={saving}>
                Annuler
              </button>
              <button type="button" className="btn primary" onClick={handleSubmit} disabled={saving}>
                {saving ? <><Loader2 size={14} strokeWidth={2} className="spin" /> Enregistrement…</> : "Enregistrer"}
              </button>
            </div>
          </div>
          <style jsx>{`
            .spin { animation: spin 1s linear infinite; }
            @keyframes spin { to { transform: rotate(360deg); } }
            input, select { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--fg); font: inherit; }
            input:focus, select:focus { outline: 2px solid var(--accent-soft); outline-offset: -1px; }
          `}</style>
        </article>
      )}

      {invoices.length === 0 ? (
        <article className="card">
          <div className="card-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 48 }}>
            <Inbox size={36} strokeWidth={1.5} style={{ color: "var(--fg-muted)" }} />
            <h3 className="serif" style={{ margin: 0, fontSize: 20, letterSpacing: "-0.02em" }}>
              Aucune facture pour l'instant
            </h3>
            <p className="muted" style={{ fontSize: 14, margin: 0, textAlign: "center" }}>
              Saisis ta première facture émise en cliquant sur « Nouvelle facture ».
            </p>
          </div>
        </article>
      ) : (
        <article className="card">
          <header className="card-head">
            <div className="segmented">
              <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
                Toutes
              </button>
              <button type="button" className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>
                À payer
              </button>
              <button type="button" className={filter === "overdue" ? "active" : ""} onClick={() => setFilter("overdue")}>
                En retard
              </button>
              <button type="button" className={filter === "paid" ? "active" : ""} onClick={() => setFilter("paid")}>
                Payées
              </button>
            </div>
            <span className="card-sub" style={{ marginLeft: "auto" }}>
              {filtered.length} affichée{filtered.length > 1 ? "s" : ""}
            </span>
          </header>
          <table className="table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Client</th>
                <th>Émise</th>
                <th>Échéance</th>
                <th>Statut</th>
                <th className="num">TTC</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const eff = effectiveStatus(inv, today);
                return (
                  <tr key={inv.id}>
                    <td className="mono"><strong style={{ fontWeight: 500 }}>{inv.number}</strong></td>
                    <td>{inv.client_name}</td>
                    <td className="mono muted">{formatDate(inv.issued_at)}</td>
                    <td className="mono muted">{formatDate(inv.due_at)}</td>
                    <td>
                      <span className={`tag ${statusTone(eff)}`}>{statusLabel(eff)}</span>
                    </td>
                    <td className="num mono">{formatEur(inv.amount_ttc_cents)}</td>
                    <td className="num">
                      {eff !== "paid" && eff !== "cancelled" && (
                        <button type="button" className="btn ghost sm" onClick={() => markPaid(inv)} title="Marquer comme payée">
                          <CheckCircle2 size={14} strokeWidth={1.7} />
                        </button>
                      )}
                      {eff === "paid" && (
                        <button type="button" className="btn ghost sm" onClick={() => markPending(inv)} title="Repasser à payer">
                          ↺
                        </button>
                      )}
                      {eff !== "cancelled" && (
                        <button type="button" className="btn ghost sm" onClick={() => cancel(inv)} title="Annuler la facture" style={{ marginLeft: 4 }}>
                          ⊘
                        </button>
                      )}
                      <button type="button" className="btn ghost sm" onClick={() => remove(inv)} title="Supprimer définitivement" style={{ marginLeft: 4 }}>
                        <X size={12} strokeWidth={1.7} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>
      )}
    </>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: full ? "1 / -1" : undefined }}>
      <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

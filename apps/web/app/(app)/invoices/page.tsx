"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Inbox, Plus, Upload, X, AlertCircle, FileText, Archive } from "lucide-react";
import {
  bulkInsertInvoices,
  createInvoice,
  deleteInvoice,
  effectiveStatus,
  listInvoices,
  updateInvoiceStatus,
  type BulkInvoiceInput,
  type EffectiveStatus,
} from "@/lib/queries/invoices";
import { getCurrentCompanyId } from "@/lib/queries/transactions";
import { parseInvoiceCsv, type ParseInvoiceResult, type ParsedInvoiceRow } from "@/lib/csv/invoice-csv-parser";
import { parseInvoicePdf, type ParseInvoicePdfResult } from "@/lib/pdf/invoice-pdf-parser";
import { parseInvoiceZip, type ParseInvoiceZipResult } from "@/lib/zip/invoice-zip-parser";
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

  // CSV import state
  const [showImport, setShowImport] = useState(false);
  const [importStep, setImportStep] = useState<"idle" | "parsing" | "preview" | "uploading" | "done" | "error">("idle");
  const [importFilename, setImportFilename] = useState("");
  const [importParseResult, setImportParseResult] = useState<ParseInvoiceResult | null>(null);
  const [importError, setImportError] = useState<string>("");
  const [importInserted, setImportInserted] = useState(0);
  const [importSkipped, setImportSkipped] = useState(0);

  // PDF import state (single file)
  const [showPdfImport, setShowPdfImport] = useState(false);
  const [pdfStep, setPdfStep] = useState<"idle" | "parsing" | "ready" | "needs_review" | "saving" | "done" | "error">("idle");
  const [pdfFilename, setPdfFilename] = useState("");
  const [pdfResult, setPdfResult] = useState<ParseInvoicePdfResult | null>(null);
  const [pdfError, setPdfError] = useState<string>("");

  // ZIP batch import state
  const [showZipImport, setShowZipImport] = useState(false);
  const [zipStep, setZipStep] = useState<"idle" | "parsing" | "preview" | "uploading" | "done" | "error">("idle");
  const [zipFilename, setZipFilename] = useState("");
  const [zipResult, setZipResult] = useState<ParseInvoiceZipResult | null>(null);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [zipError, setZipError] = useState<string>("");
  const [zipInserted, setZipInserted] = useState(0);
  const [zipSkippedDb, setZipSkippedDb] = useState(0);

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

  async function handleCsvFile(file: File) {
    setImportFilename(file.name);
    setImportStep("parsing");
    setImportError("");
    try {
      let text: string;
      try {
        text = await file.text();
        if (text.includes("�")) throw new Error("UTF-8 invalide");
      } catch {
        const buffer = await file.arrayBuffer();
        text = new TextDecoder("windows-1252").decode(buffer);
      }
      const result = parseInvoiceCsv(text);
      if (result.rows.length === 0) {
        setImportError(result.errors[0]?.message ?? "Aucune ligne reconnue.");
        setImportStep("error");
        return;
      }
      setImportParseResult(result);
      setImportStep("preview");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
      setImportStep("error");
    }
  }

  async function confirmImport() {
    if (!importParseResult || !companyId) return;
    setImportStep("uploading");
    const { inserted, skipped, errors } = await bulkInsertInvoices(
      companyId,
      importParseResult.rows,
      "csv",
      importFilename,
    );
    if (errors.length > 0) {
      setImportError(`${errors.length} erreur(s) à l'import : ${errors[0]}`);
      setImportStep("error");
      return;
    }
    setImportInserted(inserted);
    setImportSkipped(skipped);
    setImportStep("done");
    await refresh(companyId);
  }

  function resetImport() {
    setShowImport(false);
    setImportStep("idle");
    setImportFilename("");
    setImportParseResult(null);
    setImportError("");
    setImportInserted(0);
    setImportSkipped(0);
  }

  // ---------- PDF unitaire ----------

  async function handlePdfFile(file: File) {
    setPdfFilename(file.name);
    setPdfStep("parsing");
    setPdfError("");
    try {
      const result = await parseInvoicePdf(file);
      setPdfResult(result);
      setPdfStep(result.isReady ? "ready" : "needs_review");
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : String(e));
      setPdfStep("error");
    }
  }

  async function confirmPdfImport() {
    if (!pdfResult || !companyId) return;
    const inv = pdfResult.invoice;
    if (
      inv.amount_ht_cents == null ||
      inv.amount_tva_cents == null ||
      inv.amount_ttc_cents == null ||
      !inv.number ||
      !inv.client_name ||
      !inv.issued_at ||
      !inv.due_at
    ) {
      setPdfError("Champs manquants pour l'enregistrement.");
      setPdfStep("error");
      return;
    }
    setPdfStep("saving");
    const { error } = await createInvoice({
      company_id: companyId,
      number: inv.number,
      client_name: inv.client_name,
      amount_ht_cents: inv.amount_ht_cents,
      amount_tva_cents: inv.amount_tva_cents,
      amount_ttc_cents: inv.amount_ttc_cents,
      vat_rate: inv.vat_rate,
      issued_at: inv.issued_at,
      due_at: inv.due_at,
      description: null,
      source: "pdf_ocr",
      source_file: pdfFilename,
    });
    if (error) {
      setPdfError(/duplicate key|unique/i.test(error) ? `Numéro déjà utilisé : ${inv.number}` : error);
      setPdfStep("error");
      return;
    }
    setPdfStep("done");
    await refresh(companyId);
  }

  function applyPdfToManualForm() {
    if (!pdfResult) return;
    const inv = pdfResult.invoice;
    setForm({
      number: inv.number ?? "",
      client_name: inv.client_name ?? "",
      amount_ht_input: inv.amount_ht_cents != null ? (inv.amount_ht_cents / 100).toString().replace(".", ",") : "",
      vat_rate: inv.vat_rate ?? 0.2,
      issued_at: inv.issued_at ?? todayIso(),
      due_at: inv.due_at ?? plusDaysIso(30),
      description: "",
    });
    resetPdfImport();
    setShowForm(true);
  }

  function resetPdfImport() {
    setShowPdfImport(false);
    setPdfStep("idle");
    setPdfFilename("");
    setPdfResult(null);
    setPdfError("");
  }

  // ---------- ZIP en lot ----------

  async function handleZipFile(file: File) {
    setZipFilename(file.name);
    setZipStep("parsing");
    setZipError("");
    setZipProgress({ current: 0, total: 0, name: "" });
    try {
      const result = await parseInvoiceZip(file, (current, total, name) => {
        setZipProgress({ current, total, name });
      });
      if (result.fatalError) {
        setZipError(result.fatalError);
        setZipStep("error");
        return;
      }
      setZipResult(result);
      setZipStep("preview");
    } catch (e) {
      setZipError(e instanceof Error ? e.message : String(e));
      setZipStep("error");
    } finally {
      setZipProgress(null);
    }
  }

  async function confirmZipImport() {
    if (!zipResult || !companyId) return;
    setZipStep("uploading");
    // Aggregate all ready PDFs + all CSV rows into a single bulk insert
    const bulk: BulkInvoiceInput[] = [];
    for (const r of zipResult.results) {
      if (r.kind === "pdf-ready") {
        const inv = r.invoice;
        if (
          inv.number && inv.client_name && inv.issued_at && inv.due_at &&
          inv.amount_ht_cents != null && inv.amount_tva_cents != null && inv.amount_ttc_cents != null
        ) {
          bulk.push({
            number: inv.number,
            client_name: inv.client_name,
            amount_ht_cents: inv.amount_ht_cents,
            amount_tva_cents: inv.amount_tva_cents,
            amount_ttc_cents: inv.amount_ttc_cents,
            vat_rate: inv.vat_rate,
            issued_at: inv.issued_at,
            due_at: inv.due_at,
            description: null,
          });
        }
      } else if (r.kind === "csv") {
        for (const row of r.rows) {
          bulk.push({
            number: row.number,
            client_name: row.client_name,
            amount_ht_cents: row.amount_ht_cents,
            amount_tva_cents: row.amount_tva_cents,
            amount_ttc_cents: row.amount_ttc_cents,
            vat_rate: row.vat_rate,
            issued_at: row.issued_at,
            due_at: row.due_at,
            description: row.description,
          });
        }
      }
    }

    if (bulk.length === 0) {
      setZipStep("done");
      setZipInserted(0);
      setZipSkippedDb(0);
      return;
    }

    const { inserted, skipped, errors } = await bulkInsertInvoices(companyId, bulk, "csv", zipFilename);
    if (errors.length > 0) {
      setZipError(`${errors.length} erreur(s) à l'insertion : ${errors[0]}`);
      setZipStep("error");
      return;
    }
    setZipInserted(inserted);
    setZipSkippedDb(skipped);
    setZipStep("done");
    await refresh(companyId);
  }

  function resetZipImport() {
    setShowZipImport(false);
    setZipStep("idle");
    setZipFilename("");
    setZipResult(null);
    setZipProgress(null);
    setZipError("");
    setZipInserted(0);
    setZipSkippedDb(0);
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
        <div className="actions" style={{ flexWrap: "wrap", gap: 6 }}>
          <button type="button" className="btn ghost sm" onClick={() => { resetImport(); resetPdfImport(); resetZipImport(); setShowImport((v) => !v); }}>
            <Upload size={14} strokeWidth={1.7} /> CSV
          </button>
          <button type="button" className="btn ghost sm" onClick={() => { resetImport(); resetPdfImport(); resetZipImport(); setShowPdfImport((v) => !v); }}>
            <FileText size={14} strokeWidth={1.7} /> PDF
          </button>
          <button type="button" className="btn ghost sm" onClick={() => { resetImport(); resetPdfImport(); resetZipImport(); setShowZipImport((v) => !v); }}>
            <Archive size={14} strokeWidth={1.7} /> ZIP
          </button>
          <button type="button" className="btn primary sm" onClick={() => setShowForm((v) => !v)}>
            <Plus size={14} strokeWidth={2} /> {showForm ? "Annuler" : "Nouvelle facture"}
          </button>
        </div>
      </header>

      {showImport && (
        <article className="card" style={{ marginBottom: 16 }}>
          <header className="card-head">
            <div className="card-title">Import CSV</div>
            <button type="button" className="btn ghost sm" onClick={resetImport} style={{ marginLeft: "auto" }}>
              <X size={14} strokeWidth={1.7} />
            </button>
          </header>
          <div className="card-body" style={{ padding: 18 }}>
            {importStep === "idle" && <InvoiceCsvDropZone onFile={handleCsvFile} />}

            {importStep === "parsing" && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 24 }}>
                <Loader2 size={20} strokeWidth={1.7} className="spin" />
                <span>Analyse de <strong>{importFilename}</strong>…</span>
              </div>
            )}

            {importStep === "preview" && importParseResult && (
              <div>
                <p style={{ fontSize: 13, marginTop: 0 }}>
                  <strong>{importParseResult.rows.length}</strong> facture{importParseResult.rows.length > 1 ? "s" : ""} reconnue{importParseResult.rows.length > 1 ? "s" : ""} dans <strong>{importFilename}</strong>
                  {importParseResult.errors.length > 0 ? ` · ${importParseResult.errors.length} ligne(s) ignorée(s)` : ""}
                </p>
                {Object.keys(importParseResult.detectedColumns).length > 0 && (
                  <p className="muted" style={{ fontSize: 12, margin: "0 0 12px" }}>
                    Colonnes détectées : {Object.entries(importParseResult.detectedColumns).map(([k, v]) => `${k}=${v}`).join(" · ")}
                  </p>
                )}
                <table className="table" style={{ marginBottom: 12 }}>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Client</th>
                      <th>Émise</th>
                      <th>Échéance</th>
                      <th className="num">TTC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importParseResult.rows.slice(0, 10).map((r, i) => (
                      <tr key={i}>
                        <td className="mono">{r.number}</td>
                        <td>{r.client_name}</td>
                        <td className="mono muted">{formatDate(r.issued_at)}</td>
                        <td className="mono muted">{formatDate(r.due_at)}</td>
                        <td className="num mono">{formatEur(r.amount_ttc_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importParseResult.rows.length > 10 && (
                  <p className="muted" style={{ fontSize: 12, margin: "0 0 12px" }}>
                    … et {importParseResult.rows.length - 10} autres lignes.
                  </p>
                )}
                {importParseResult.errors.length > 0 && (
                  <details style={{ marginBottom: 12, fontSize: 12 }}>
                    <summary>{importParseResult.errors.length} erreur(s) à l'analyse</summary>
                    <ul style={{ margin: "8px 0 0 16px" }}>
                      {importParseResult.errors.slice(0, 20).map((e, i) => (
                        <li key={i}>Ligne {e.line} : {e.message}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="btn ghost" onClick={resetImport}>Annuler</button>
                  <button type="button" className="btn primary" onClick={confirmImport}>
                    Importer {importParseResult.rows.length} facture{importParseResult.rows.length > 1 ? "s" : ""}
                  </button>
                </div>
              </div>
            )}

            {importStep === "uploading" && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 24 }}>
                <Loader2 size={20} strokeWidth={1.7} className="spin" />
                <span>Enregistrement dans Supabase…</span>
              </div>
            )}

            {importStep === "done" && (
              <div style={{ padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <CheckCircle2 size={22} strokeWidth={1.7} color={importInserted > 0 ? "var(--success)" : "var(--fg-muted)"} />
                  <h3 className="serif" style={{ margin: 0, fontSize: 18 }}>
                    {importInserted > 0 ? "Import terminé" : "Rien à importer"}
                  </h3>
                </div>
                <p style={{ fontSize: 13, margin: "0 0 12px" }}>
                  <strong>{importInserted}</strong> facture{importInserted > 1 ? "s" : ""} importée{importInserted > 1 ? "s" : ""}
                  {importSkipped > 0 ? ` · ${importSkipped} doublon${importSkipped > 1 ? "s" : ""} ignoré${importSkipped > 1 ? "s" : ""}` : ""}
                  {" depuis "}<strong>{importFilename}</strong>.
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="btn ghost" onClick={resetImport}>Fermer</button>
                </div>
              </div>
            )}

            {importStep === "error" && (
              <div style={{ padding: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <AlertCircle size={20} strokeWidth={1.7} color="var(--danger)" />
                  <div>
                    <strong>Échec de l'import</strong>
                    <p className="muted" style={{ fontSize: 13, margin: "4px 0 12px" }}>{importError}</p>
                    <button type="button" className="btn ghost sm" onClick={resetImport}>Réessayer</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <style jsx>{`
            .spin { animation: spin 1s linear infinite; }
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </article>
      )}

      {showPdfImport && (
        <article className="card" style={{ marginBottom: 16 }}>
          <header className="card-head">
            <div className="card-title">Import PDF unitaire</div>
            <button type="button" className="btn ghost sm" onClick={resetPdfImport} style={{ marginLeft: "auto" }}>
              <X size={14} strokeWidth={1.7} />
            </button>
          </header>
          <div className="card-body" style={{ padding: 18 }}>
            {pdfStep === "idle" && (
              <SingleFileDropZone accept=".pdf,application/pdf" hint="Une facture PDF (texte sélectionnable, pas un scan)" onFile={handlePdfFile} />
            )}
            {pdfStep === "parsing" && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 24 }}>
                <Loader2 size={20} strokeWidth={1.7} className="spin" />
                <span>Extraction de <strong>{pdfFilename}</strong>…</span>
              </div>
            )}
            {(pdfStep === "ready" || pdfStep === "needs_review") && pdfResult && (
              <div>
                <p style={{ fontSize: 13, marginTop: 0 }}>
                  Source : <strong>{pdfFilename}</strong>
                  {pdfStep === "needs_review" && (
                    <span className="tag" style={{ marginLeft: 8, color: "var(--warning)" }}>Vérification requise</span>
                  )}
                </p>
                <table className="table" style={{ marginBottom: 12 }}>
                  <tbody>
                    {[
                      ["N°", pdfResult.invoice.number],
                      ["Client", pdfResult.invoice.client_name],
                      ["Émise", pdfResult.invoice.issued_at],
                      ["Échéance", pdfResult.invoice.due_at],
                      ["HT", pdfResult.invoice.amount_ht_cents != null ? formatEur(pdfResult.invoice.amount_ht_cents) : null],
                      ["TVA", pdfResult.invoice.amount_tva_cents != null ? formatEur(pdfResult.invoice.amount_tva_cents) : null],
                      ["TTC", pdfResult.invoice.amount_ttc_cents != null ? formatEur(pdfResult.invoice.amount_ttc_cents) : null],
                      ["Taux TVA", pdfResult.invoice.vat_rate != null ? `${(pdfResult.invoice.vat_rate * 100).toFixed(1)} %` : null],
                    ].map(([k, v]) => (
                      <tr key={k as string}>
                        <td style={{ fontSize: 12, color: "var(--fg-muted)", width: 100 }}>{k}</td>
                        <td>{v ?? <em className="muted">(non détecté)</em>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pdfResult.warnings.length > 0 && (
                  <div style={{ padding: 10, background: "var(--warning-soft)", borderRadius: 6, marginBottom: 12 }}>
                    <strong style={{ fontSize: 13 }}>{pdfResult.warnings.length} avertissement(s)</strong>
                    <ul style={{ margin: "6px 0 0 16px", fontSize: 12 }}>
                      {pdfResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="btn ghost" onClick={resetPdfImport}>Annuler</button>
                  {pdfStep === "needs_review" ? (
                    <button type="button" className="btn primary" onClick={applyPdfToManualForm}>
                      Corriger via formulaire
                    </button>
                  ) : (
                    <button type="button" className="btn primary" onClick={confirmPdfImport}>
                      Enregistrer la facture
                    </button>
                  )}
                </div>
              </div>
            )}
            {pdfStep === "saving" && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 24 }}>
                <Loader2 size={20} strokeWidth={1.7} className="spin" />
                <span>Enregistrement…</span>
              </div>
            )}
            {pdfStep === "done" && (
              <div style={{ padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <CheckCircle2 size={22} strokeWidth={1.7} color="var(--success)" />
                  <h3 className="serif" style={{ margin: 0, fontSize: 18 }}>Facture importée</h3>
                </div>
                <p style={{ fontSize: 13, margin: "0 0 12px" }}>
                  <strong>{pdfResult?.invoice.number}</strong> — <strong>{pdfResult?.invoice.client_name}</strong> — {pdfResult?.invoice.amount_ttc_cents != null ? formatEur(pdfResult.invoice.amount_ttc_cents) : ""}
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="btn ghost" onClick={resetPdfImport}>Fermer</button>
                </div>
              </div>
            )}
            {pdfStep === "error" && (
              <div style={{ padding: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <AlertCircle size={20} strokeWidth={1.7} color="var(--danger)" />
                  <div>
                    <strong>Échec</strong>
                    <p className="muted" style={{ fontSize: 13, margin: "4px 0 12px" }}>{pdfError}</p>
                    <button type="button" className="btn ghost sm" onClick={resetPdfImport}>Réessayer</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <style jsx>{`
            .spin { animation: spin 1s linear infinite; }
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </article>
      )}

      {showZipImport && (
        <article className="card" style={{ marginBottom: 16 }}>
          <header className="card-head">
            <div className="card-title">Import ZIP en lot</div>
            <button type="button" className="btn ghost sm" onClick={resetZipImport} style={{ marginLeft: "auto" }}>
              <X size={14} strokeWidth={1.7} />
            </button>
          </header>
          <div className="card-body" style={{ padding: 18 }}>
            {zipStep === "idle" && (
              <SingleFileDropZone accept=".zip,application/zip" hint="Un ZIP contenant des PDF et/ou CSV de factures · max 50 Mo, 100 fichiers" onFile={handleZipFile} />
            )}
            {zipStep === "parsing" && (
              <div style={{ padding: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <Loader2 size={20} strokeWidth={1.7} className="spin" />
                  <span>Traitement de <strong>{zipFilename}</strong>…</span>
                </div>
                {zipProgress && zipProgress.total > 0 && (
                  <div>
                    <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 4 }}>
                      {zipProgress.current} / {zipProgress.total} · {zipProgress.name}
                    </div>
                    <div style={{ height: 4, background: "var(--surface-sunken)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(zipProgress.current / zipProgress.total) * 100}%`, background: "var(--accent)", transition: "width 0.2s" }} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {zipStep === "preview" && zipResult && (
              <ZipPreview result={zipResult} filename={zipFilename} onConfirm={confirmZipImport} onCancel={resetZipImport} />
            )}
            {zipStep === "uploading" && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 24 }}>
                <Loader2 size={20} strokeWidth={1.7} className="spin" />
                <span>Enregistrement en lot…</span>
              </div>
            )}
            {zipStep === "done" && (
              <div style={{ padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <CheckCircle2 size={22} strokeWidth={1.7} color={zipInserted > 0 ? "var(--success)" : "var(--fg-muted)"} />
                  <h3 className="serif" style={{ margin: 0, fontSize: 18 }}>
                    {zipInserted > 0 ? "Lot importé" : "Rien à importer"}
                  </h3>
                </div>
                <p style={{ fontSize: 13, margin: "0 0 12px" }}>
                  <strong>{zipInserted}</strong> facture{zipInserted > 1 ? "s" : ""} importée{zipInserted > 1 ? "s" : ""}
                  {zipSkippedDb > 0 ? ` · ${zipSkippedDb} doublon${zipSkippedDb > 1 ? "s" : ""} ignoré${zipSkippedDb > 1 ? "s" : ""}` : ""}
                  {" depuis "}<strong>{zipFilename}</strong>.
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="btn ghost" onClick={resetZipImport}>Fermer</button>
                </div>
              </div>
            )}
            {zipStep === "error" && (
              <div style={{ padding: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <AlertCircle size={20} strokeWidth={1.7} color="var(--danger)" />
                  <div>
                    <strong>Échec du traitement ZIP</strong>
                    <p className="muted" style={{ fontSize: 13, margin: "4px 0 12px" }}>{zipError}</p>
                    <button type="button" className="btn ghost sm" onClick={resetZipImport}>Réessayer</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <style jsx>{`
            .spin { animation: spin 1s linear infinite; }
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </article>
      )}

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

function SingleFileDropZone({ accept, hint, onFile }: { accept: string; hint: string; onFile: (f: File) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }
  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  }
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      style={{
        display: "block",
        padding: 32,
        border: `2px dashed ${isDragging ? "var(--accent)" : "var(--border-strong)"}`,
        borderRadius: "var(--r-md)",
        textAlign: "center",
        cursor: "pointer",
        transition: "border-color 0.15s",
        background: isDragging ? "var(--accent-soft)" : "transparent",
      }}
    >
      <input type="file" accept={accept} onChange={handleSelect} style={{ display: "none" }} />
      <Upload size={26} strokeWidth={1.5} style={{ color: "var(--fg-muted)", marginBottom: 10 }} />
      <h4 className="serif" style={{ fontSize: 16, margin: "0 0 4px" }}>Dépose ton fichier</h4>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>{hint}</p>
    </label>
  );
}

function ZipPreview({
  result,
  filename,
  onConfirm,
  onCancel,
}: {
  result: ParseInvoiceZipResult;
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ready = result.results.filter((r) => r.kind === "pdf-ready");
  const review = result.results.filter((r) => r.kind === "pdf-needs-review");
  const csv = result.results.filter((r) => r.kind === "csv");
  const skipped = result.results.filter((r) => r.kind === "skipped");
  const failed = result.results.filter((r) => r.kind === "failed");

  const csvRowCount = csv.reduce((s, r) => s + ("rows" in r ? r.rows.length : 0), 0);
  const willInsert = ready.length + csvRowCount;

  return (
    <div>
      <p style={{ fontSize: 13, marginTop: 0 }}>
        Source : <strong>{filename}</strong> · {result.totalEntries} fichier{result.totalEntries > 1 ? "s" : ""} dans le ZIP
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 16 }}>
        <Tile label="PDF prêts" value={ready.length} tone="success" />
        <Tile label="PDF à vérifier" value={review.length} tone="warning" />
        <Tile label="Lignes CSV" value={csvRowCount} tone="info" />
        <Tile label="Ignorés" value={skipped.length} tone="muted" />
        <Tile label="Erreurs" value={failed.length} tone="danger" />
      </div>

      {(review.length > 0 || skipped.length > 0 || failed.length > 0) && (
        <details style={{ fontSize: 12, marginBottom: 12 }}>
          <summary>Détail des fichiers non automatiquement importables</summary>
          <ul style={{ margin: "8px 0 0 16px" }}>
            {review.map((r, i) => "filename" in r && (
              <li key={`r-${i}`}><strong>{r.filename}</strong> — à vérifier ({"warnings" in r ? r.warnings.length : 0} avertissement(s))</li>
            ))}
            {skipped.map((r, i) => "filename" in r && (
              <li key={`s-${i}`}><strong>{r.filename}</strong> — ignoré : {"reason" in r ? r.reason : ""}</li>
            ))}
            {failed.map((r, i) => "filename" in r && (
              <li key={`f-${i}`}><strong>{r.filename}</strong> — erreur : {"reason" in r ? r.reason : ""}</li>
            ))}
          </ul>
        </details>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>
        <button type="button" className="btn primary" onClick={onConfirm} disabled={willInsert === 0}>
          Importer {willInsert} facture{willInsert > 1 ? "s" : ""}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 11, margin: "8px 0 0", textAlign: "right" }}>
        Les PDF à vérifier ne sont pas importés automatiquement. Reprends-les un par un via « Importer PDF » après le lot.
      </p>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  const colorMap: Record<string, string> = {
    success: "var(--success)",
    warning: "var(--warning)",
    info: "var(--accent)",
    muted: "var(--fg-muted)",
    danger: "var(--danger)",
  };
  return (
    <div style={{ padding: 10, background: "var(--surface-sunken)", borderRadius: 6, textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 500, color: colorMap[tone] ?? "var(--fg)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>{label}</div>
    </div>
  );
}

function InvoiceCsvDropZone({ onFile }: { onFile: (f: File) => void }) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }
  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  }

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      style={{
        display: "block",
        padding: 32,
        border: `2px dashed ${isDragging ? "var(--accent)" : "var(--border-strong)"}`,
        borderRadius: "var(--r-md)",
        textAlign: "center",
        cursor: "pointer",
        transition: "border-color 0.15s",
        background: isDragging ? "var(--accent-soft)" : "transparent",
      }}
    >
      <input type="file" accept=".csv,.txt" onChange={handleSelect} style={{ display: "none" }} />
      <Upload size={26} strokeWidth={1.5} style={{ color: "var(--fg-muted)", marginBottom: 10 }} />
      <h4 className="serif" style={{ fontSize: 16, margin: "0 0 4px" }}>Dépose ton CSV de factures</h4>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Colonnes attendues : numero, client, ht (ou ttc), tva ou taux_tva, date, echeance · Sépa <code>;</code> ou <code>,</code> · UTF-8 ou Win-1252
      </p>
    </label>
  );
}

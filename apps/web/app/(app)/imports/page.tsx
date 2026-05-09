"use client";

import { useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { parseCicCsv, rowsToTransactions, type ParseResult } from "@/lib/csv/cic-parser";
import { parseCicPdf } from "@/lib/pdf/cic-parser";
import { insertTransactions, getCurrentCompanyId } from "@/lib/queries/transactions";

type Step = "idle" | "parsing" | "preview" | "uploading" | "done" | "error";
type FileKind = "csv" | "pdf";

function detectKind(filename: string): FileKind {
  return filename.toLowerCase().endsWith(".pdf") ? "pdf" : "csv";
}

export default function ImportsPage() {
  const [step, setStep] = useState<Step>("idle");
  const [filename, setFilename] = useState<string>("");
  const [fileKind, setFileKind] = useState<FileKind>("csv");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [insertedCount, setInsertedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [archivedInsertedCount, setArchivedInsertedCount] = useState(0);
  const [openInsertedCount, setOpenInsertedCount] = useState(0);

  async function handleFiles(filesArr: File[]) {
    if (filesArr.length === 0) return;
    setFilename(filesArr.length === 1 ? filesArr[0].name : `${filesArr.length} fichiers`);
    // If any file is PDF, treat the whole batch as PDF source for tx_source classification.
    const anyPdf = filesArr.some((f) => detectKind(f.name) === "pdf");
    setFileKind(anyPdf ? "pdf" : "csv");
    setStep("parsing");
    setErrorMessage("");

    const aggregatedRows: ParseResult["rows"] = [];
    const aggregatedErrors: ParseResult["errors"] = [];
    let detectedFormat: ParseResult["detectedFormat"] = "single-amount";

    for (const file of filesArr) {
      try {
        let result: ParseResult;
        if (detectKind(file.name) === "pdf") {
          result = await parseCicPdf(file);
        } else {
          let text: string;
          try {
            text = await file.text();
            if (text.includes("\uFFFD")) throw new Error("Invalid UTF-8");
          } catch {
            const buffer = await file.arrayBuffer();
            text = new TextDecoder("windows-1252").decode(buffer);
          }
          result = parseCicCsv(text);
        }
        aggregatedRows.push(...result.rows);
        for (const e of result.errors) {
          aggregatedErrors.push({ line: e.line, message: `[${file.name}] ${e.message}` });
        }
        if (result.detectedFormat !== "unknown") detectedFormat = result.detectedFormat;
      } catch (e) {
        aggregatedErrors.push({
          line: 0,
          message: `[${file.name}] ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }

    if (aggregatedRows.length === 0) {
      setErrorMessage(aggregatedErrors[0]?.message ?? "Aucune ligne reconnue dans ces fichiers.");
      setStep("error");
      return;
    }

    setParseResult({ rows: aggregatedRows, errors: aggregatedErrors, detectedFormat });
    setStep("preview");
  }

  async function confirmImport() {
    if (!parseResult) return;
    setStep("uploading");

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      setErrorMessage("Aucune entreprise associée à ton compte. Configure d'abord ta SARL dans Supabase.");
      setStep("error");
      return;
    }

    const transactions = rowsToTransactions(
      parseResult.rows,
      companyId,
      fileKind === "pdf" ? "ocr_pdf" : "csv",
    );
    const { inserted, skipped, errors, archivedInserted, openInserted } = await insertTransactions(transactions);

    if (errors.length > 0) {
      setErrorMessage(`${errors.length} erreur(s) à l'import : ${errors[0]}`);
      setStep("error");
      return;
    }

    setInsertedCount(inserted);
    setSkippedCount(skipped);
    setArchivedInsertedCount(archivedInserted);
    setOpenInsertedCount(openInserted);
    setStep("done");
  }

  function reset() {
    setStep("idle");
    setParseResult(null);
    setErrorMessage("");
    setFilename("");
    setInsertedCount(0);
    setSkippedCount(0);
    setArchivedInsertedCount(0);
    setOpenInsertedCount(0);
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
            Import
          </h1>
          <p>Glisse ton export bancaire CIC en CSV ou PDF. On reconnaît les libellés, dates et montants automatiquement.</p>
        </div>
      </header>

      {step === "idle" && <DropZone onFiles={handleFiles} />}

      {step === "parsing" && (
        <article className="card">
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 12, padding: 32 }}>
            <Loader2 size={20} strokeWidth={1.7} className="spin" />
            <span>Lecture de <strong>{filename}</strong>...</span>
          </div>
        </article>
      )}

      {step === "preview" && parseResult && (
        <ImportPreview
          result={parseResult}
          filename={filename}
          onConfirm={confirmImport}
          onCancel={reset}
        />
      )}

      {step === "uploading" && (
        <article className="card">
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 12, padding: 32 }}>
            <Loader2 size={20} strokeWidth={1.7} className="spin" />
            <span>Enregistrement des transactions dans Supabase...</span>
          </div>
        </article>
      )}

      {step === "done" && (
        <article className="card" style={{ borderColor: insertedCount > 0 ? "var(--success)" : "var(--border-strong)" }}>
          <div className="card-body" style={{ padding: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <CheckCircle2 size={24} strokeWidth={1.7} color={insertedCount > 0 ? "var(--success)" : "var(--fg-muted)"} />
              <h2 className="serif" style={{ fontSize: 22, margin: 0, letterSpacing: "-0.02em" }}>
                {insertedCount > 0 ? "Import réussi" : "Rien à importer"}
              </h2>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 14 }}>
              <strong>{insertedCount}</strong> transaction{insertedCount > 1 ? "s" : ""} importée{insertedCount > 1 ? "s" : ""} depuis <strong>{filename}</strong>
              {skippedCount > 0 && (
                <> · <strong>{skippedCount}</strong> doublon{skippedCount > 1 ? "s" : ""} ignoré{skippedCount > 1 ? "s" : ""}</>
              )}
              .
            </p>
            {archivedInsertedCount > 0 && (
              <p style={{ margin: "0 0 20px", fontSize: 13, padding: 10, background: "var(--surface-sunken)", borderRadius: 6 }}>
                <strong>{openInsertedCount}</strong> dans la période courante ·{" "}
                <strong>{archivedInsertedCount}</strong> archivée{archivedInsertedCount > 1 ? "s" : ""} (date ≤ dernière clôture).
                {" "}Les écritures archivées sont consultables dans <a href="/archives" style={{ textDecoration: "underline" }}>Archives</a>.
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <a href="/dashboard" className="btn primary sm" style={{ textDecoration: "none" }}>
                Voir le dashboard →
              </a>
              <button type="button" className="btn ghost sm" onClick={reset}>
                Importer un autre fichier
              </button>
            </div>
          </div>
        </article>
      )}

      {step === "error" && (
        <article className="card" style={{ borderColor: "var(--danger)" }}>
          <div className="card-body" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
              <AlertCircle size={20} strokeWidth={1.7} color="var(--danger)" />
              <div>
                <strong>Échec de l'import</strong>
                <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
                  {errorMessage}
                </p>
              </div>
            </div>
            <button type="button" className="btn ghost sm" onClick={reset}>
              Réessayer
            </button>
          </div>
        </article>
      )}

      <style jsx>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

// ============ Dropzone ============

function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onFiles(files);
  }

  return (
    <article className="card">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          display: "block",
          padding: 64,
          border: `2px dashed ${isDragging ? "var(--accent)" : "var(--border-strong)"}`,
          borderRadius: "var(--r-md)",
          margin: 18,
          textAlign: "center",
          cursor: "pointer",
          transition: "border-color 0.15s",
          background: isDragging ? "var(--accent-soft)" : "transparent",
        }}
      >
        <input
          type="file"
          accept=".csv,.txt,.pdf,application/pdf"
          multiple
          onChange={handleSelect}
          style={{ display: "none" }}
        />
        <Upload size={32} strokeWidth={1.5} style={{ color: "var(--fg-muted)", marginBottom: 16 }} />
        <h3 className="serif" style={{ fontSize: 22, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
          Dépose tes exports CIC (CSV ou PDF) ici
        </h3>
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>
          un ou plusieurs fichiers, ou clique pour parcourir
        </p>
        <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
          Formats CSV ou PDF · multi-fichiers OK · doublons auto-détectés (par contenu)
        </p>
      </label>
    </article>
  );
}

// ============ Preview ============

function ImportPreview({
  result,
  filename,
  onConfirm,
  onCancel,
}: {
  result: ParseResult;
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const total = result.rows.length;
  const totalIncome = result.rows.filter((r) => r.amount_cents > 0).reduce((s, r) => s + r.amount_cents, 0);
  const totalExpense = result.rows.filter((r) => r.amount_cents < 0).reduce((s, r) => s + Math.abs(r.amount_cents), 0);

  function fmt(cents: number) {
    return `${(cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
  }

  return (
    <>
      <article className="card">
        <header className="card-head">
          <div>
            <div className="card-title">{filename}</div>
            <div className="card-sub">
              {total} ligne(s) reconnue(s) · format détecté : {result.detectedFormat}
            </div>
          </div>
          <span className="tag success" style={{ marginLeft: "auto" }}>
            <FileText size={12} strokeWidth={1.7} style={{ marginRight: 4 }} />
            Prêt
          </span>
        </header>
        <div className="card-body">
          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            <div>
              <div className="kpi-label">Revenus</div>
              <div className="serif" style={{ fontSize: 22, color: "var(--success)" }}>
                +{fmt(totalIncome)}
              </div>
            </div>
            <div>
              <div className="kpi-label">Dépenses</div>
              <div className="serif" style={{ fontSize: 22, color: "var(--danger)" }}>
                −{fmt(totalExpense)}
              </div>
            </div>
            <div>
              <div className="kpi-label">Solde net</div>
              <div className="serif" style={{ fontSize: 22 }}>
                {fmt(totalIncome - totalExpense)}
              </div>
            </div>
          </div>
        </div>

        {result.errors.length > 0 && (
          <div style={{ padding: "12px 18px", background: "var(--warning-soft)", fontSize: 12 }}>
            ⚠ {result.errors.length} ligne(s) ignorée(s) (format invalide)
          </div>
        )}
      </article>

      <article className="card">
        <header className="card-head">
          <div className="card-title">Aperçu — 10 premières transactions</div>
          <span className="card-sub" style={{ marginLeft: 6 }}>(sur {total})</span>
        </header>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Libellé</th>
              <th className="num">Montant</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.slice(0, 10).map((row, i) => (
              <tr key={i}>
                <td className="mono muted">{new Date(row.date).toLocaleDateString("fr-FR")}</td>
                <td>{row.label}</td>
                <td
                  className="num mono"
                  style={{ color: row.amount_cents >= 0 ? "var(--success)" : "var(--fg)" }}
                >
                  {row.amount_cents >= 0 ? "+" : "−"} {fmt(Math.abs(row.amount_cents))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="button" className="btn primary" onClick={onConfirm}>
          Importer {total} transactions
        </button>
      </div>
    </>
  );
}

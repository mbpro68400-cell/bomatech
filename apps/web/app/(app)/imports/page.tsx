"use client";

import { useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { parseCicCsv, rowsToTransactions, type ParseResult } from "@/lib/csv/cic-parser";
import { insertTransactions, getCurrentCompanyId } from "@/lib/queries/transactions";

type Step = "idle" | "parsing" | "preview" | "uploading" | "done" | "error";

export default function ImportsPage() {
  const [step, setStep] = useState<Step>("idle");
  const [filename, setFilename] = useState<string>("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [insertedCount, setInsertedCount] = useState(0);

  async function handleFile(file: File) {
    setFilename(file.name);
    setStep("parsing");
    setErrorMessage("");

    try {
      // Try UTF-8 first, fall back to Windows-1252 (CIC default)
      let text: string;
      try {
        text = await file.text();
        if (text.includes("\uFFFD")) throw new Error("Invalid UTF-8");
      } catch {
        const buffer = await file.arrayBuffer();
        const decoder = new TextDecoder("windows-1252");
        text = decoder.decode(buffer);
      }

      const result = parseCicCsv(text);

      if (result.rows.length === 0) {
        setErrorMessage(
          result.errors[0]?.message ?? "Aucune ligne reconnue dans ce fichier.",
        );
        setStep("error");
        return;
      }

      setParseResult(result);
      setStep("preview");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
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

    const transactions = rowsToTransactions(parseResult.rows, companyId);
    const { inserted, errors } = await insertTransactions(transactions);

    if (errors.length > 0) {
      setErrorMessage(`${errors.length} erreur(s) à l'import : ${errors[0]}`);
      setStep("error");
      return;
    }

    setInsertedCount(inserted);
    setStep("done");
  }

  function reset() {
    setStep("idle");
    setParseResult(null);
    setErrorMessage("");
    setFilename("");
    setInsertedCount(0);
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
            Import
          </h1>
          <p>Glisse ton export bancaire CIC. On reconnaît les libellés, dates et montants automatiquement.</p>
        </div>
      </header>

      {step === "idle" && <DropZone onFile={handleFile} />}

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
        <article className="card" style={{ borderColor: "var(--success)" }}>
          <div className="card-body" style={{ padding: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <CheckCircle2 size={24} strokeWidth={1.7} color="var(--success)" />
              <h2 className="serif" style={{ fontSize: 22, margin: 0, letterSpacing: "-0.02em" }}>
                Import réussi
              </h2>
            </div>
            <p style={{ margin: "0 0 20px", fontSize: 14 }}>
              <strong>{insertedCount}</strong> transaction(s) importée(s) depuis <strong>{filename}</strong>.
              Tu peux maintenant aller voir ton tableau de bord.
            </p>
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

function DropZone({ onFile }: { onFile: (f: File) => void }) {
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
          accept=".csv,.txt"
          onChange={handleSelect}
          style={{ display: "none" }}
        />
        <Upload size={32} strokeWidth={1.5} style={{ color: "var(--fg-muted)", marginBottom: 16 }} />
        <h3 className="serif" style={{ fontSize: 22, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
          Dépose ton export CIC ici
        </h3>
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>
          ou clique pour parcourir tes fichiers
        </p>
        <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
          Format CSV · jusqu'à 10 Mo · encodage UTF-8 ou Windows-1252
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

"use client";

/**
 * Phase 1.7 — Gestion des périodes comptables.
 *
 * V1 SCOPE NOTICE
 * ----------------
 * - Action de clôture irréversible en V1 (réopen prévu en V2).
 * - Auth check côté DB (RPC close_period vérifie owner/admin en première
 *   instruction). Le bouton UI est visible mais l'action échouera pour
 *   les autres rôles avec 'Forbidden: only owner or admin can close a period'.
 * - Diff cash/runway pré/post calculé localement côté TS (sur les transactions
 *   open period chargées) pour que l'utilisateur voie l'impact AVANT confirmation.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Lock, AlertTriangle, CheckCircle2, X, ChevronRight } from "lucide-react";
import {
  closePeriod,
  getCompanyPeriod,
  listClosures,
  type CompanyPeriod,
} from "@/lib/queries/accounting";
import { getCurrentCompanyId, listTransactions } from "@/lib/queries/transactions";
import { listInvoices } from "@/lib/queries/invoices";
import { recomputeFull } from "@/lib/engines/financial-state";
import type { AccountingClosure, FinancialState, Invoice, Transaction } from "@/lib/engines/types";

function formatDateFr(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatEur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PeriodsPage() {
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [period, setPeriod] = useState<CompanyPeriod | null>(null);
  const [closures, setClosures] = useState<AccountingClosure[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showModal, setShowModal] = useState(false);
  // Phase 1.7.1 fix Bug 3 : cooldown du bouton "Clôturer" après succès,
  // pour éviter qu'un user re-clique parce qu'il n'a pas vu de feedback.
  const [recentClosureAt, setRecentClosureAt] = useState<Date | null>(null);
  const [, setTick] = useState(0);
  const isInCooldown = recentClosureAt != null && Date.now() - recentClosureAt.getTime() < 10_000;

  async function refresh(cid: string) {
    const [p, cs, txs, invs] = await Promise.all([
      getCompanyPeriod(cid),
      listClosures(cid),
      listTransactions(cid, 5000),
      listInvoices(cid, 1000),
    ]);
    setPeriod(p);
    setClosures(cs);
    setTransactions(txs);
    setInvoices(invs);
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

  // Tick chaque seconde pendant le cooldown pour réévaluer isInCooldown
  useEffect(() => {
    if (!recentClosureAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    const timeout = setTimeout(() => setRecentClosureAt(null), 10_000);
    return () => { clearInterval(id); clearTimeout(timeout); };
  }, [recentClosureAt]);

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
          <h1 className="serif">Périodes comptables</h1>
          <p>
            Gestion des exercices : visualisation de la période courante, clôtures passées, et action de clôture.
            <br />
            <span className="muted" style={{ fontSize: 12 }}>
              ⚠️ La clôture est <strong>irréversible</strong> en V1.
            </span>
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn primary sm"
            onClick={() => setShowModal(true)}
            disabled={isInCooldown}
            title={isInCooldown ? "Clôture validée à l'instant — patiente quelques secondes" : undefined}
          >
            {isInCooldown ? (
              <><CheckCircle2 size={14} strokeWidth={1.7} /> Clôture validée ✓</>
            ) : (
              <><Lock size={14} strokeWidth={1.7} /> Clôturer la période</>
            )}
          </button>
        </div>
      </header>

      <div className="grid cols-2" style={{ gap: 12, marginBottom: 16 }}>
        <article className="card">
          <header className="card-head">
            <div className="card-title">Période courante</div>
          </header>
          <div className="card-body" style={{ padding: 14 }}>
            <div style={{ fontSize: 13 }}>
              <div><span className="muted">Depuis :</span> <strong>{formatDateFr(period?.current_period_start ?? null)}</strong></div>
              <div style={{ marginTop: 4 }}><span className="muted">Aucune clôture si :</span> <em className="muted">{period?.current_period_start ? "période ouverte" : "jamais clôturée"}</em></div>
            </div>
          </div>
        </article>
        <article className="card">
          <header className="card-head">
            <div className="card-title">Dernière clôture</div>
          </header>
          <div className="card-body" style={{ padding: 14 }}>
            <div style={{ fontSize: 13 }}>
              <div><span className="muted">Date :</span> <strong>{formatDateFr(period?.last_closing_date ?? null)}</strong></div>
              <div style={{ marginTop: 4 }}><span className="muted">Total clôtures historique :</span> <strong>{closures.length}</strong></div>
            </div>
          </div>
        </article>
      </div>

      <article className="card" style={{ marginBottom: 16 }}>
        <header className="card-head">
          <div className="card-title">Historique des clôtures</div>
          <span className="card-sub" style={{ marginLeft: 8 }}>{closures.length}</span>
        </header>
        <div className="card-body" style={{ padding: 0 }}>
          {closures.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--fg-muted)" }}>
              Aucune clôture pour l'instant. La première clôture créera l'exercice 1.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Période</th>
                  <th>Clôturée le</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {closures.map((c) => (
                  <tr key={c.id}>
                    <td><strong style={{ fontWeight: 500 }}>{formatDateFr(c.period_start)}</strong> → {formatDateFr(c.period_end)}</td>
                    <td className="muted">{formatDateFr(c.closed_at.slice(0, 10))}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{c.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </article>

      {showModal && companyId && (
        <CloseModal
          companyId={companyId}
          period={period}
          transactions={transactions}
          invoices={invoices}
          onClose={() => setShowModal(false)}
          onConfirmed={async () => {
            setShowModal(false);
            setRecentClosureAt(new Date());
            if (companyId) await refresh(companyId);
          }}
        />
      )}

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

// ============ Close modal with cash/runway diff preview ============

function CloseModal({
  companyId,
  period,
  transactions,
  invoices,
  onClose,
  onConfirmed,
}: {
  companyId: string;
  period: CompanyPeriod | null;
  transactions: Transaction[];
  invoices: Invoice[];
  onClose: () => void;
  onConfirmed: () => Promise<void>;
}) {
  // Phase 1.7.1 : 2 modes de modal selon company.current_period_start.
  //   * 1ère clôture (current_period_start === null) : 2 inputs date (start + end)
  //   * Clôtures suivantes : période courante en lecture seule + 1 input date (end)
  const isFirstClosure = period?.current_period_start == null;

  // Default sensé pour periodStart en mode 1ère clôture : la date de la
  // plus ancienne transaction de la company (ou today si aucune).
  const defaultPeriodStart = useMemo(() => {
    if (transactions.length === 0) return todayIso();
    return transactions.map((t) => t.date).sort()[0];
  }, [transactions]);

  const [periodStart, setPeriodStart] = useState<string>(
    period?.current_period_start ?? defaultPeriodStart,
  );
  const [periodEnd, setPeriodEnd] = useState<string>(todayIso());
  const [notes, setNotes] = useState<string>("");
  const [confirmText, setConfirmText] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string>("");

  const today = todayIso();
  // En mode "clôtures suivantes", periodStart est verrouillé à current_period_start.
  const effectivePeriodStart = isFirstClosure ? periodStart : (period!.current_period_start as string);

  // Calcul local du diff cash/runway pré vs post (sans toucher la DB). Pure.
  const diff = useMemo(() => {
    const before = recomputeFull(companyId, transactions, today);
    const futureTx = transactions.filter((t) => t.date > periodEnd);
    const after = recomputeFull(companyId, futureTx, today);
    return { before, after };
  }, [companyId, transactions, periodEnd, today]);

  const txArchivedCount = transactions.filter((t) => t.date <= periodEnd).length;
  const invoicesArchivedCount = invoices.filter((i) => i.issued_at <= periodEnd).length;

  const dateValid = effectivePeriodStart <= periodEnd && periodEnd <= today;
  const confirmValid = confirmText.trim().toUpperCase() === "CLOTURER";
  const canSubmit = dateValid && confirmValid && !submitting && !success;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");

    // Mode 1ère clôture : on passe p_period_start à la RPC (la v2 le requiert).
    // Sinon : on laisse la RPC dériver depuis company.current_period_start.
    const { ok, error: errMsg } = await closePeriod(
      companyId,
      periodEnd,
      notes.trim() || undefined,
      isFirstClosure ? periodStart : undefined,
    );
    setSubmitting(false);
    if (!ok || errMsg) {
      setError(errMsg ?? "Erreur inconnue");
      return;
    }

    // Phase 1.7.1 fix Bug 3 : overlay succès distinct AVANT de fermer la modal.
    // L'utilisateur voit explicitement "OK ça a marché" avant que la modal disparaisse.
    setSuccess(true);
    setTimeout(async () => {
      await onConfirmed();
    }, 2500);
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !submitting && !success) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100, padding: 16,
      }}
    >
      <div className="card" style={{ maxWidth: 640, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        {success ? (
          // ============ Phase 1.7.1 fix Bug 3 — overlay succès ============
          <div style={{ padding: 48, textAlign: "center" }}>
            <CheckCircle2 size={56} strokeWidth={1.5} color="var(--success)" style={{ margin: "0 auto 16px" }} />
            <h2 className="serif" style={{ fontSize: 22, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
              Période clôturée avec succès
            </h2>
            <p style={{ fontSize: 15, margin: "0 0 8px" }}>
              du <strong>{formatDateFr(effectivePeriodStart)}</strong> au <strong>{formatDateFr(periodEnd)}</strong>
            </p>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 16px" }}>
              {txArchivedCount} transaction{txArchivedCount > 1 ? "s" : ""} et {invoicesArchivedCount} facture{invoicesArchivedCount > 1 ? "s" : ""} archivée{invoicesArchivedCount > 1 ? "s" : ""}.
            </p>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              <Loader2 size={14} strokeWidth={1.7} className="spin" style={{ verticalAlign: "middle", marginRight: 6 }} />
              Rafraîchissement des données…
            </p>
            <style jsx>{`
              .spin { animation: spin 1s linear infinite; display: inline-block; }
              @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
          </div>
        ) : (
          <>
            <header className="card-head">
              <div className="card-title">
                {isFirstClosure ? "Première clôture comptable" : "Clôturer la période comptable"}
              </div>
              <button type="button" className="btn ghost sm" onClick={onClose} disabled={submitting} style={{ marginLeft: "auto" }}>
                <X size={14} strokeWidth={1.7} />
              </button>
            </header>
            <div className="card-body" style={{ padding: 18 }}>
              <div style={{ padding: 12, background: "var(--warning-soft)", borderRadius: 6, marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
                <AlertTriangle size={18} strokeWidth={1.7} color="var(--warning)" />
                <div style={{ fontSize: 13 }}>
                  <strong>Action irréversible en V1.</strong>{" "}
                  Une fois clôturée, les écritures avec date ≤ date de fin deviennent <strong>lecture seule</strong> (modifications/suppressions interdites au niveau base de données). La V2 prévoit la réouverture documentée.
                </div>
              </div>

              {/* Période courante en lecture seule (mode clôtures suivantes) */}
              {!isFirstClosure && (
                <div style={{ marginBottom: 16, padding: 12, background: "var(--surface-sunken)", borderRadius: 6, fontSize: 13 }}>
                  <span className="muted">Période courante :</span>{" "}
                  depuis le <strong>{formatDateFr(period!.current_period_start)}</strong>
                </div>
              )}

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: isFirstClosure ? "1fr 1fr" : "1fr 1fr", marginBottom: 16 }}>
                {isFirstClosure ? (
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                      Date de <strong>début</strong> de période *
                    </span>
                    <input
                      type="date"
                      name="period_start"
                      value={periodStart}
                      max={periodEnd}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", color: "var(--fg)", font: "inherit" }}
                    />
                    <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                      1ère clôture : saisis explicitement le début (par défaut, la plus ancienne transaction).
                    </span>
                  </label>
                ) : (
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>Notes (optionnelles)</span>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="ex: clôture exercice 2025"
                      maxLength={200}
                      style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", color: "var(--fg)", font: "inherit" }}
                    />
                  </label>
                )}

                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                    Date de <strong>fin</strong> de période *
                  </span>
                  <input
                    type="date"
                    name="period_end"
                    value={periodEnd}
                    min={effectivePeriodStart}
                    max={today}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", color: "var(--fg)", font: "inherit" }}
                  />
                  {!dateValid && (
                    <span style={{ fontSize: 11, color: "var(--danger)" }}>
                      La fin doit être ≥ début ({formatDateFr(effectivePeriodStart)}) et ≤ aujourd'hui.
                    </span>
                  )}
                </label>
              </div>

              {/* Notes en mode 1ère clôture (pleine largeur) */}
              {isFirstClosure && (
                <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                  <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>Notes (optionnelles)</span>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="ex: clôture exercice 2024"
                    maxLength={200}
                    style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", color: "var(--fg)", font: "inherit" }}
                  />
                </label>
              )}

              {/* ============ Phase 1.7.1 fix Bug 1 — preview FR longue ============ */}
              <div style={{ marginBottom: 16, padding: 14, background: "var(--accent-soft, rgba(99,102,241,0.08))", borderRadius: 6, borderLeft: "3px solid var(--accent)" }}>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 6 }}>
                  ▶ Vous allez clôturer la période :
                </div>
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
                  du <span style={{ color: "var(--accent)" }}>{formatDateFr(effectivePeriodStart)}</span>
                  {" "}au <span style={{ color: "var(--accent)" }}>{formatDateFr(periodEnd)}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                  ▶ Cette action archivera <strong>{txArchivedCount}</strong> transaction{txArchivedCount > 1 ? "s" : ""} et <strong>{invoicesArchivedCount}</strong> facture{invoicesArchivedCount > 1 ? "s" : ""} (lecture seule).
                </div>
              </div>

              <div style={{ marginBottom: 16, padding: 12, background: "var(--surface-sunken)", borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 8 }}>
                  Impact sur les KPIs dashboard (simulation locale) :
                </div>
                <table className="table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Avant</th>
                      <th>Après</th>
                      <th>Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <DiffRow label="Trésorerie" beforeCents={diff.before.cash_cents} afterCents={diff.after.cash_cents} />
                    <DiffRow label="Revenus 30j" beforeCents={diff.before.revenue_30d} afterCents={diff.after.revenue_30d} />
                    <DiffRow label="Revenus 90j" beforeCents={diff.before.revenue_90d} afterCents={diff.after.revenue_90d} />
                    <RunwayRow before={diff.before.runway_months} after={diff.after.runway_months} />
                  </tbody>
                </table>
                <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                  Les KPIs ne refléteront que la <strong>période courante</strong> (depuis {formatDateFr(periodEnd)} +1 jour). Archives consultables dans <a href="/archives" style={{ textDecoration: "underline" }}>Archives</a>.
                </div>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                <span style={{ fontSize: 13 }}>
                  Pour confirmer, recopie le mot <strong style={{ fontFamily: "var(--font-mono)" }}>CLOTURER</strong> :
                </span>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="CLOTURER"
                  style={{ padding: "8px 10px", border: `1px solid ${confirmValid ? "var(--success)" : "var(--border)"}`, borderRadius: 6, background: "var(--surface)", color: "var(--fg)", font: "inherit" }}
                />
              </label>

              {error && (
                <div style={{ padding: 10, background: "var(--danger-soft, rgba(220,38,38,0.1))", color: "var(--danger)", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn ghost" onClick={onClose} disabled={submitting}>
                  Annuler
                </button>
                <button type="button" className="btn primary" onClick={submit} disabled={!canSubmit}>
                  {submitting ? <><Loader2 size={14} strokeWidth={1.7} className="spin" /> Clôture en cours…</> : <><Lock size={14} strokeWidth={1.7} /> Confirmer la clôture</>}
                </button>
              </div>
            </div>
            <style jsx>{`
              .spin { animation: spin 1s linear infinite; }
              @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
          </>
        )}
      </div>
    </div>
  );
}

function DiffRow({ label, beforeCents, afterCents }: { label: string; beforeCents: number; afterCents: number }) {
  const delta = afterCents - beforeCents;
  return (
    <tr>
      <td className="muted">{label}</td>
      <td className="mono">{formatEur(beforeCents)}</td>
      <td className="mono">{formatEur(afterCents)}</td>
      <td className="mono" style={{ color: delta < 0 ? "var(--danger)" : delta > 0 ? "var(--success)" : "var(--fg-muted)" }}>
        {delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${formatEur(delta)}`}
      </td>
    </tr>
  );
}

function RunwayRow({ before, after }: { before: number | null; after: number | null }) {
  const fmt = (v: number | null) => (v != null ? `${v.toFixed(1)} mois` : "—");
  const delta = before != null && after != null ? after - before : null;
  return (
    <tr>
      <td className="muted">Runway</td>
      <td className="mono">{fmt(before)}</td>
      <td className="mono">{fmt(after)}</td>
      <td className="mono" style={{ color: delta != null && delta < 0 ? "var(--danger)" : delta != null && delta > 0 ? "var(--success)" : "var(--fg-muted)" }}>
        {delta == null ? "—" : delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} mois`}
      </td>
    </tr>
  );
}

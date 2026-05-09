"use client";

import { useEffect, useState } from "react";
import { CashflowChart } from "@/components/charts/cashflow-chart";
import { AlertTriangle, TrendingUp, LineChart, Loader2, Inbox } from "lucide-react";
import {
  getCurrentCompanyId,
  listTransactions,
  getLatestState,
  upsertState,
} from "@/lib/queries/transactions";
import { listInvoices } from "@/lib/queries/invoices";
import { recomputeFull } from "@/lib/engines/financial-state";
import { evaluateInsights, evaluateInvoiceInsights } from "@/lib/engines/decision";
import { computeARSummary, emptyARSummary, type ARSummary } from "@/lib/engines/invoice-stats";
import type { FinancialState, Insight, Transaction } from "@/lib/engines/types";

function formatEur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)} %`;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<FinancialState | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [txCount, setTxCount] = useState(0);
  const [ar, setAr] = useState<ARSummary>(emptyARSummary());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const companyId = await getCurrentCompanyId();
      if (!companyId) {
        if (!cancelled) setLoading(false);
        return;
      }

      // Phase 5 : load transactions + invoices in parallel
      const [transactions, invoices] = await Promise.all([
        listTransactions(companyId, 1000),
        listInvoices(companyId, 1000),
      ]);
      if (cancelled) return;

      setTxCount(transactions.length);

      const today = new Date().toISOString().slice(0, 10);
      const arSummary = computeARSummary(invoices, today);
      setAr(arSummary);

      if (transactions.length === 0 && invoices.length === 0) {
        setLoading(false);
        return;
      }

      // Compute financial state only if we have transactions
      let newState: FinancialState | null = null;
      let txInsights: Insight[] = [];
      if (transactions.length > 0) {
        newState = recomputeFull(companyId, transactions, today);
        txInsights = evaluateInsights(newState, transactions);
        void upsertState(newState);
      }

      // Phase 5 : invoice-driven insights (payment_delay)
      const invInsights = evaluateInvoiceInsights(companyId, invoices, today);

      if (!cancelled) {
        setState(newState);
        setInsights([...txInsights, ...invInsights]);
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 32 }}>
        <Loader2 size={20} strokeWidth={1.7} className="spin" />
        <span className="muted">Chargement de tes données...</span>
        <style jsx>{`
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!state || txCount === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
            Tableau de bord
          </h1>
          <p>
            {txCount} transaction{txCount > 1 ? "s" : ""} · Mis à jour il y a quelques secondes
          </p>
        </div>
        <div className="actions">
          <a href="/imports" className="btn ghost sm" style={{ textDecoration: "none" }}>
            Importer
          </a>
          <a href="/transactions" className="btn primary sm" style={{ textDecoration: "none" }}>
            Voir transactions
          </a>
        </div>
      </header>

      {/* KPI row */}
      <div className="grid cols-4">
        <article className="card">
          <div className="kpi">
            <div className="kpi-label">Trésorerie</div>
            <div className="kpi-value">{formatEur(state.cash_cents)}</div>
            <div className="kpi-sub">
              <span className="muted">solde net cumulé</span>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="kpi">
            <div className="kpi-label">Revenus 30j</div>
            <div className="kpi-value">{formatEur(state.revenue_30d)}</div>
            <div className="kpi-sub">
              <span className="muted">{state.revenue_90d > 0 ? "tendance" : "—"}</span>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="kpi">
            <div className="kpi-label">Marge brute</div>
            <div className="kpi-value">
              {state.revenue_90d > 0 ? formatPct(state.gross_margin_pct) : "—"}
            </div>
            <div className="kpi-sub">
              <span className="muted">90j glissants</span>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="kpi">
            <div className="kpi-label">Runway</div>
            <div className="kpi-value">
              {state.runway_months ? `${state.runway_months.toFixed(1)} mois` : "—"}
            </div>
            <div className="kpi-sub">
              <span className="muted">
                {state.runway_months ? "au rythme actuel" : "pas de burn"}
              </span>
            </div>
          </div>
        </article>
      </div>

      {/* Phase 5 : Créances clients */}
      {ar.pendingCount > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="divider-label" style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <span>Créances clients</span>
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <a href="/invoices" className="muted" style={{ fontSize: 12, textDecoration: "none", flex: "none" }}>
              Voir factures →
            </a>
          </div>
          <div className="grid cols-4">
            <article className="card">
              <div className="kpi">
                <div className="kpi-label">À encaisser</div>
                <div className="kpi-value">{formatEur(ar.totalARCents)}</div>
                <div className="kpi-sub">
                  <span className="muted">{ar.pendingCount} facture{ar.pendingCount > 1 ? "s" : ""} en attente</span>
                </div>
              </div>
            </article>
            <article className="card" style={ar.overdueCount > 0 ? { borderColor: "var(--danger)" } : undefined}>
              <div className="kpi">
                <div className="kpi-label">En retard</div>
                <div className="kpi-value" style={ar.overdueCount > 0 ? { color: "var(--danger)" } : undefined}>
                  {ar.overdueCount > 0 ? formatEur(ar.overdueARCents) : "—"}
                </div>
                <div className="kpi-sub">
                  <span className="muted">
                    {ar.overdueCount > 0 ? `${ar.overdueCount} facture${ar.overdueCount > 1 ? "s" : ""}` : "aucun retard"}
                  </span>
                </div>
              </div>
            </article>
            <article className="card">
              <div className="kpi">
                <div className="kpi-label">DSO moyen</div>
                <div className="kpi-value">{ar.avgAgeDays} j</div>
                <div className="kpi-sub">
                  <span className="muted">âge moyen pondéré</span>
                </div>
              </div>
            </article>
            <article className="card">
              <div className="kpi">
                <div className="kpi-label">Plus vieux retard</div>
                <div className="kpi-value">{ar.oldestOverdueDays > 0 ? `${ar.oldestOverdueDays} j` : "—"}</div>
                <div className="kpi-sub">
                  <span className="muted">{ar.oldestOverdueDays > 60 ? "critique" : ar.oldestOverdueDays > 30 ? "à relancer" : "OK"}</span>
                </div>
              </div>
            </article>
          </div>
        </div>
      )}

      {/* Cashflow */}
      <div style={{ marginTop: 16 }}>
        <article className="card">
          <header className="card-head">
            <div>
              <div className="card-title">Cashflow mensuel</div>
              <div className="card-sub">12 derniers mois · revenus vs charges</div>
            </div>
          </header>
          <div className="card-body">
            <CashflowChart />
          </div>
        </article>
      </div>

      {/* Insights AI */}
      <div className="divider-label" style={{ display: "flex", alignItems: "center" }}>
        <span>Insights</span>
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <span className={`tag ${insights.length > 0 ? "warning" : "success"}`} style={{ flex: "none" }}>
          {insights.length} actif{insights.length !== 1 ? "s" : ""}
        </span>
      </div>

      {insights.length === 0 ? (
        <article className="card">
          <div className="card-body" style={{ padding: 24, textAlign: "center" }}>
            <p className="muted" style={{ margin: 0 }}>
              Aucune alerte détectée. Tout va bien !
            </p>
          </div>
        </article>
      ) : (
        <div className="grid cols-3">
          {insights.slice(0, 6).map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const colors = {
    critical: { bg: "var(--danger-soft)", fg: "var(--danger)", icon: AlertTriangle, tag: "warning" as const },
    warning: { bg: "var(--warning-soft)", fg: "var(--warning)", icon: AlertTriangle, tag: "warning" as const },
    info: { bg: "var(--accent-soft)", fg: "var(--accent)", icon: TrendingUp, tag: "muted" as const },
    positive: { bg: "var(--success-soft)", fg: "var(--success)", icon: LineChart, tag: "success" as const },
  };

  const { bg, fg, icon: Icon, tag } = colors[insight.level];

  return (
    <article className="card">
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--r-sm)",
            background: bg,
            color: fg,
            display: "grid",
            placeItems: "center",
          }}
        >
          <Icon size={16} strokeWidth={1.7} />
        </div>
        <div>
          <strong style={{ fontSize: 14 }}>{insight.title}</strong>
        </div>
        <span className={`tag ${tag}`} style={{ alignSelf: "flex-start" }}>
          {insight.level}
        </span>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <article className="card" style={{ marginTop: 32 }}>
      <div className="card-body" style={{ padding: 64, textAlign: "center" }}>
        <Inbox size={40} strokeWidth={1.4} style={{ color: "var(--fg-muted)", marginBottom: 16 }} />
        <h2 className="serif" style={{ fontSize: 26, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
          Pas encore de données.
        </h2>
        <p className="muted" style={{ fontSize: 15, margin: "0 auto 24px", maxWidth: 420, lineHeight: 1.5 }}>
          Importe ton premier relevé bancaire CIC pour voir ton tableau de bord
          se remplir avec tes vrais chiffres.
        </p>
        <a href="/imports" className="btn primary" style={{ textDecoration: "none" }}>
          Importer un relevé →
        </a>
      </div>
    </article>
  );
}

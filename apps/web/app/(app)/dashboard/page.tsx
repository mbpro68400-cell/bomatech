"use client";

import { CashflowChart } from "@/components/charts/cashflow-chart";
import { AlertTriangle, TrendingUp, LineChart } from "lucide-react";

export default function DashboardPage() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
            Tableau de bord
          </h1>
          <p>Mis à jour il y a 3 min · Atelier Marchand SARL</p>
        </div>
        <div className="actions">
          <button type="button" className="btn ghost sm">Exporter</button>
          <button type="button" className="btn primary sm">+ Nouveau scénario</button>
        </div>
      </header>

      {/* KPI row */}
      <div className="grid cols-4">
        <article className="card">
          <div className="kpi">
            <div className="kpi-label">Trésorerie</div>
            <div className="kpi-value">87 420 €</div>
            <div className="kpi-sub">
              <span className="delta up">+8,4 %</span>
              <span className="muted">vs M-1</span>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="kpi">
            <div className="kpi-label">Revenus 30j</div>
            <div className="kpi-value">23 150 €</div>
            <div className="kpi-sub">
              <span className="delta up">+12,1 %</span>
              <span className="muted">vs M-1</span>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="kpi">
            <div className="kpi-label">Dépenses</div>
            <div className="kpi-value">14 280 €</div>
            <div className="kpi-sub">
              <span className="delta down">−3,2 %</span>
              <span className="muted">vs M-1</span>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="kpi">
            <div className="kpi-label">Résultat net</div>
            <div className="kpi-value">8 870 €</div>
            <div className="kpi-sub">
              <span className="delta up">+21,5 %</span>
              <span className="muted">vs M-1</span>
            </div>
          </div>
        </article>
      </div>

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
        <span>Insights IA</span>
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <span className="tag success" style={{ flex: "none" }}>3 nouveaux</span>
      </div>

      <div className="grid cols-3">
        <article className="card">
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--r-sm)",
                background: "var(--warning-soft)",
                color: "var(--warning)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <AlertTriangle size={16} strokeWidth={1.7} />
            </div>
            <div>
              <strong style={{ fontSize: 14 }}>Anomalie détectée</strong>
              <p className="muted" style={{ fontSize: 13, margin: "4px 0 0", lineHeight: 1.5 }}>
                Pic de dépenses SaaS <strong>+34 %</strong> ce mois. Revue recommandée.
              </p>
            </div>
            <span className="tag warning" style={{ alignSelf: "flex-start" }}>Attention</span>
          </div>
        </article>

        <article className="card">
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--r-sm)",
                background: "var(--accent-soft)",
                color: "var(--accent)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <TrendingUp size={16} strokeWidth={1.7} />
            </div>
            <div>
              <strong style={{ fontSize: 14 }}>Opportunité</strong>
              <p className="muted" style={{ fontSize: 13, margin: "4px 0 0", lineHeight: 1.5 }}>
                Délai de paiement client moyen : <strong>38 j</strong>. Objectif : 30 j.
              </p>
            </div>
            <span className="tag success" style={{ alignSelf: "flex-start" }}>Action possible</span>
          </div>
        </article>

        <article className="card">
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--r-sm)",
                background: "var(--success-soft)",
                color: "var(--success)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <LineChart size={16} strokeWidth={1.7} />
            </div>
            <div>
              <strong style={{ fontSize: 14 }}>Prévision 30 j</strong>
              <p className="muted" style={{ fontSize: 13, margin: "4px 0 0", lineHeight: 1.5 }}>
                Trésorerie estimée à <strong>91 200 €</strong> dans 30 jours (conf. 87 %).
              </p>
            </div>
            <span className="tag success" style={{ alignSelf: "flex-start" }}>OK</span>
          </div>
        </article>
      </div>
    </>
  );
}

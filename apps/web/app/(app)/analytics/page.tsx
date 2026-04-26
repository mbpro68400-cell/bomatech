"use client";

import { useState } from "react";
import { CashflowChart } from "@/components/charts/cashflow-chart";
import { RevenueEvolutionChart } from "@/components/charts/revenue-evolution-chart";
import { TopCategoriesChart } from "@/components/charts/top-categories-chart";

type Period = "monthly" | "yearly";

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("monthly");
  const [comparison, setComparison] = useState(true);

  return (
    <>
      {/* Page header */}
      <header className="page-head">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
            Analytics financières
          </h1>
          <p>Lecture claire de ton activité. Pas de jargon comptable.</p>
        </div>
        <div className="actions">
          <div className="segmented">
            <button
              type="button"
              className={period === "monthly" ? "active" : ""}
              onClick={() => setPeriod("monthly")}
            >
              Mensuel
            </button>
            <button
              type="button"
              className={period === "yearly" ? "active" : ""}
              onClick={() => setPeriod("yearly")}
            >
              Annuel
            </button>
          </div>
          <button
            type="button"
            className={`btn sm${comparison ? " primary" : ""}`}
            onClick={() => setComparison((c) => !c)}
          >
            Comparer N-1
          </button>
        </div>
      </header>

      {/* KPI row */}
      <div className="grid cols-4">
        <article className="card">
          <div className="kpi">
            <div className="kpi-label">CA annuel projeté</div>
            <div className="kpi-value">812 400 €</div>
            <div className="kpi-sub">
              <span className="delta up">+8,6 % vs N-1</span>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="kpi">
            <div className="kpi-label">Marge brute</div>
            <div className="kpi-value">68,2 %</div>
            <div className="kpi-sub">
              <span className="delta up">+2,1 pt vs N-1</span>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="kpi">
            <div className="kpi-label">Marge nette</div>
            <div className="kpi-value">21,4 %</div>
            <div className="kpi-sub">
              <span className="delta up">+1,9 pt vs N-1</span>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="kpi">
            <div className="kpi-label">Burn mensuel</div>
            <div className="kpi-value">62 630 €</div>
            <div className="kpi-sub">
              <span className="delta down">+8,4 % vs N-1</span>
            </div>
          </div>
        </article>
      </div>

      {/* Cashflow */}
      <div style={{ marginTop: 16 }}>
        <article className="card">
          <header className="card-head">
            <div>
              <div className="card-title">Cashflow mensuel — revenus vs charges</div>
              <div className="card-sub">12 derniers mois · comparaison N / N-1</div>
            </div>
          </header>
          <div className="card-body">
            <CashflowChart />
          </div>
        </article>
      </div>

      {/* Evolution + Top categories */}
      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <article className="card">
          <header className="card-head">
            <div className="card-title">Évolution du CA</div>
            <span className="card-sub" style={{ marginLeft: 6 }}>
              Cumulé vs objectif annuel
            </span>
          </header>
          <div className="card-body">
            <RevenueEvolutionChart />
          </div>
        </article>

        <article className="card">
          <header className="card-head">
            <div className="card-title">Top catégories de dépenses</div>
            <span className="card-sub" style={{ marginLeft: 6 }}>
              Avril 2026
            </span>
          </header>
          <div className="card-body">
            <TopCategoriesChart />
          </div>
        </article>
      </div>
    </>
  );
}

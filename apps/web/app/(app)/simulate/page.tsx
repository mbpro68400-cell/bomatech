"use client";

import { useState } from "react";

export default function SimulatePage() {
  const [revenueDelta, setRevenueDelta] = useState(0);
  const [chargesDelta, setChargesDelta] = useState(0);
  const [capex, setCapex] = useState(0);
  const [horizon, setHorizon] = useState(6);

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="serif">Simulation</h1>
          <p>Fais varier les paramètres, vois l'impact sur ta trésorerie.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn ghost sm">Réinitialiser</button>
          <button type="button" className="btn primary sm">Sauvegarder</button>
        </div>
      </header>

      <div className="grid cols-2">
        {/* Params */}
        <article className="card">
          <header className="card-head">
            <div className="card-title">Paramètres</div>
            <div className="segmented" style={{ marginLeft: "auto" }}>
              <button
                type="button"
                className={horizon === 3 ? "active" : ""}
                onClick={() => setHorizon(3)}
              >3M</button>
              <button
                type="button"
                className={horizon === 6 ? "active" : ""}
                onClick={() => setHorizon(6)}
              >6M</button>
              <button
                type="button"
                className={horizon === 12 ? "active" : ""}
                onClick={() => setHorizon(12)}
              >12M</button>
            </div>
          </header>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="tweak-row">
              <label className="tweak-label flex justify-between">
                <span>Variation revenus</span>
                <span className="mono" style={{ color: "var(--fg)" }}>
                  {revenueDelta > 0 ? "+" : ""}
                  {revenueDelta}%
                </span>
              </label>
              <input
                type="range"
                min="-50"
                max="50"
                value={revenueDelta}
                onChange={(e) => setRevenueDelta(Number(e.target.value))}
                style={{ accentColor: "var(--accent)", width: "100%" }}
              />
            </div>

            <div className="tweak-row">
              <label className="tweak-label flex justify-between">
                <span>Charges récurrentes (€/mois)</span>
                <span className="mono" style={{ color: "var(--fg)" }}>
                  {chargesDelta > 0 ? "+" : ""}
                  {chargesDelta.toLocaleString("fr-FR")} €
                </span>
              </label>
              <input
                type="range"
                min="-5000"
                max="10000"
                step="100"
                value={chargesDelta}
                onChange={(e) => setChargesDelta(Number(e.target.value))}
                style={{ accentColor: "var(--accent)", width: "100%" }}
              />
            </div>

            <div className="tweak-row">
              <label className="tweak-label flex justify-between">
                <span>Capex ponctuel (€)</span>
                <span className="mono" style={{ color: "var(--fg)" }}>
                  {capex.toLocaleString("fr-FR")} €
                </span>
              </label>
              <input
                type="range"
                min="0"
                max="100000"
                step="1000"
                value={capex}
                onChange={(e) => setCapex(Number(e.target.value))}
                style={{ accentColor: "var(--accent)", width: "100%" }}
              />
            </div>
          </div>
          <footer className="card-foot">
            <span className="mono" style={{ fontSize: 11 }}>
              Horizon : {horizon} mois
            </span>
          </footer>
        </article>

        {/* Impact */}
        <article className="card">
          <header className="card-head">
            <div>
              <div className="card-title">Impact</div>
              <div className="card-sub">Baseline vs scénario à {horizon} mois</div>
            </div>
            <span className="tag success" style={{ marginLeft: "auto" }}>safe</span>
          </header>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="flex justify-between items-center">
              <span className="muted">Trésorerie fin de période</span>
              <span className="serif" style={{ fontSize: 22 }}>
                87 420 €
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="muted">Écart vs baseline</span>
              <span className="delta up">+0 €</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="muted">Runway</span>
              <span className="mono">8,4 mois</span>
            </div>
          </div>
          <footer className="card-foot">
            <span className="mono" style={{ fontSize: 11 }}>
              POST /api/v1/simulate · debounce 250ms
            </span>
          </footer>
        </article>
      </div>
    </>
  );
}

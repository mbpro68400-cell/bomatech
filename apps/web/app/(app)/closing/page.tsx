export default function ClosingPage() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
            Avant-clôture
          </h1>
          <p>Bilan prévisionnel · résultat estimé · check-list de vérification.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn primary sm">Lancer l'analyse</button>
        </div>
      </header>

      <div className="grid cols-3">
        <article className="card">
          <div className="kpi">
            <div className="kpi-label">CA estimé</div>
            <div className="kpi-value">812 400 €</div>
            <div className="kpi-sub">
              <span className="muted">au 31/12/2026</span>
            </div>
          </div>
        </article>
        <article className="card">
          <div className="kpi">
            <div className="kpi-label">Résultat avant impôt</div>
            <div className="kpi-value">174 200 €</div>
            <div className="kpi-sub">
              <span className="delta up">+12,4 %</span>
            </div>
          </div>
        </article>
        <article className="card">
          <div className="kpi">
            <div className="kpi-label">Impôt société estimé</div>
            <div className="kpi-value">43 550 €</div>
            <div className="kpi-sub">
              <span className="muted">taux moyen 25 %</span>
            </div>
          </div>
        </article>
      </div>

      <div className="divider-label">Bilan en langage naturel</div>

      <article className="card">
        <div className="card-body">
          <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            Ton activité a <strong>progressé de 8,6 %</strong> par rapport à l'an dernier, portée par un volume client stable et des marges en amélioration. Les charges restent maîtrisées, sauf sur les <strong>SaaS (+34 %)</strong> qui méritent une revue. À ce rythme, tu termines l'année avec une trésorerie solide et un résultat net positif d'environ <strong>130 650 €</strong> après impôt.
          </p>
        </div>
        <footer className="card-foot">
          <span className="muted" style={{ fontSize: 12 }}>
            Cette synthèse est indicative. Pour la clôture officielle, consulte ton expert-comptable.
          </span>
        </footer>
      </article>
    </>
  );
}

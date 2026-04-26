const DEMO = [
  {
    level: "warning" as const,
    type: "Dépendance client",
    title: "Duval SAS pèse 34 % de ton CA",
    body: "Sur les 90 derniers jours, Duval SAS représente une part importante de tes revenus. Envisage de diversifier ton portefeuille client.",
    facts: "3 factures · 28 380 € · 34 % du CA",
  },
  {
    level: "warning" as const,
    type: "Charges en hausse",
    title: "Frais SaaS +52 %",
    body: "La catégorie SaaS a augmenté de 52 % sur 90 jours. Vérifie les abonnements inutilisés.",
    facts: "9 transactions · 56 700 € (vs 37 200 € avant)",
  },
  {
    level: "positive" as const,
    type: "Signal positif",
    title: "Marge brute au-dessus de 40 %",
    body: "Ta marge brute progresse, c'est un bon signe de santé opérationnelle.",
    facts: "Marge brute : 40,3 % (+2,1 pts)",
  },
];

export default function InsightsPage() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="serif">Insights</h1>
          <p>Ce que tu dois regarder en priorité cette semaine.</p>
        </div>
      </header>

      <div className="grid" style={{ gap: 12 }}>
        {DEMO.map((i) => (
          <article key={i.title} className="card">
            <header className="card-head">
              <span className={`tag ${i.level === "positive" ? "success" : "warning"}`}>
                {i.level}
              </span>
              <div className="card-title">{i.title}</div>
              <span className="card-sub" style={{ marginLeft: "auto" }}>{i.type}</span>
            </header>
            <div className="card-body">
              <p style={{ margin: "0 0 8px", fontSize: 14 }}>{i.body}</p>
              <p className="mono muted" style={{ fontSize: 11, margin: 0 }}>{i.facts}</p>
            </div>
            <footer className="card-foot">
              <button type="button" className="btn ghost sm">Ignorer</button>
              <button type="button" className="btn sm" style={{ marginLeft: "auto" }}>
                Voir les transactions
              </button>
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}

const DEMO = [
  { id: 1, date: "18 nov.", label: "Facture F-2026-184", counterparty: "Duval SAS", category: "client", amount: 420000, kind: "revenue" },
  { id: 2, date: "15 nov.", label: "Commande #8442", counterparty: "Bois Laurent", category: "matières", amount: -218000, kind: "cost_var" },
  { id: 3, date: "15 nov.", label: "Électricité nov.", counterparty: "EDF Pro", category: "utilités", amount: -51240, kind: "cost_fix" },
  { id: 4, date: "12 nov.", label: "Facture F-2026-183", counterparty: "Belmont SARL", category: "client", amount: 184000, kind: "revenue" },
  { id: 5, date: "01 nov.", label: "Loyer atelier", counterparty: "SCI Les Forges", category: "loyer", amount: -148000, kind: "cost_fix" },
  { id: 6, date: "01 nov.", label: "Salaire S. Marchand", counterparty: "Marchand Sophie", category: "salaires", amount: -320000, kind: "cost_fix" },
];

function formatAmount(cents: number) {
  const sign = cents >= 0 ? "+" : "−";
  return `${sign} ${Math.abs(cents / 100).toLocaleString("fr-FR")} €`;
}

export default function TransactionsPage() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="serif">Transactions</h1>
          <p>{DEMO.length} mouvements · 90 derniers jours</p>
        </div>
        <div className="actions">
          <button type="button" className="btn ghost sm">Filtrer</button>
          <button type="button" className="btn primary sm">+ Nouvelle</button>
        </div>
      </header>

      <article className="card">
        <header className="card-head">
          <div className="segmented">
            <button type="button" className="active">Toutes</button>
            <button type="button">Revenus</button>
            <button type="button">Charges</button>
            <button type="button">Taxes</button>
          </div>
        </header>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Libellé</th>
              <th>Tiers</th>
              <th>Catégorie</th>
              <th className="num">Montant</th>
            </tr>
          </thead>
          <tbody>
            {DEMO.map((tx) => (
              <tr key={tx.id}>
                <td className="mono" style={{ color: "var(--fg-muted)" }}>{tx.date}</td>
                <td><strong style={{ fontWeight: 500 }}>{tx.label}</strong></td>
                <td>{tx.counterparty}</td>
                <td>
                  <span className={`tag ${tx.kind === "revenue" ? "success" : "muted"}`}>
                    {tx.category}
                  </span>
                </td>
                <td
                  className="num mono"
                  style={{ color: tx.amount >= 0 ? "var(--success)" : "var(--fg)" }}
                >
                  {formatAmount(tx.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  );
}

import { Upload, FileText, Building2 } from "lucide-react";

const SOURCES = [
  { icon: Upload, label: "CSV / Excel", desc: "Relevé bancaire ou export comptable", action: "Importer" },
  { icon: FileText, label: "PDF (factures, relevés)", desc: "OCR automatique via Mistral", action: "Importer" },
  { icon: Building2, label: "Connexion bancaire (PSD2)", desc: "Sync auto via Bridge", action: "Connecter" },
];

const RECENT = [
  { name: "releve_BNP_avril.csv", date: "22 avr.", count: "47 transactions", status: "ok" as const },
  { name: "facture_AcmeCorp_T2.pdf", date: "20 avr.", count: "1 facture · 4 200 €", status: "ok" as const },
  { name: "export_compta_mars.xlsx", date: "05 avr.", count: "112 transactions", status: "review" as const },
];

export default function ImportsPage() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
            Imports
          </h1>
          <p>Importe tes données. Tout reste éditable avant validation.</p>
        </div>
      </header>

      {/* Sources */}
      <div className="grid cols-3">
        {SOURCES.map((s) => {
          const Icon = s.icon;
          return (
            <article key={s.label} className="card">
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "var(--r-md)",
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon size={18} strokeWidth={1.7} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
                  <p className="muted" style={{ fontSize: 13, margin: 0 }}>{s.desc}</p>
                </div>
                <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }}>
                  {s.action} →
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="divider-label">Imports récents</div>

      <article className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Fichier</th>
              <th>Date</th>
              <th>Contenu</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {RECENT.map((r) => (
              <tr key={r.name}>
                <td><strong style={{ fontWeight: 500 }}>{r.name}</strong></td>
                <td className="mono muted">{r.date}</td>
                <td>{r.count}</td>
                <td>
                  <span className={`tag ${r.status === "ok" ? "success" : "warning"}`}>
                    {r.status === "ok" ? "Validé" : "À revoir"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  );
}

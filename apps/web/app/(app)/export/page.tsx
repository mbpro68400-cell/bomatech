export default function ExportPage() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
            Export comptable
          </h1>
          <p>Export aux formats EC et FEC pour ton expert-comptable.</p>
        </div>
      </header>

      <div className="grid cols-2">
        <article className="card">
          <header className="card-head">
            <div className="card-title">Format EC</div>
            <span className="card-sub" style={{ marginLeft: 6 }}>Écritures comptables</span>
          </header>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="tweak-row">
              <label className="tweak-label">Période</label>
              <input className="input" defaultValue="01/01/2026 → 30/04/2026" />
            </div>
            <button type="button" className="btn primary">Télécharger CSV</button>
          </div>
        </article>

        <article className="card">
          <header className="card-head">
            <div className="card-title">Format FEC</div>
            <span className="card-sub" style={{ marginLeft: 6 }}>Fichier des écritures comptables</span>
          </header>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="tweak-row">
              <label className="tweak-label">Exercice</label>
              <input className="input" defaultValue="2026" />
            </div>
            <button type="button" className="btn primary">Générer FEC</button>
          </div>
        </article>
      </div>
    </>
  );
}

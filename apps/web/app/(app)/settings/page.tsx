export default function SettingsPage() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="serif">Réglages</h1>
          <p>Entreprise, membres et facturation.</p>
        </div>
      </header>

      <div className="grid cols-2">
        <article className="card">
          <header className="card-head">
            <div className="card-title">Entreprise</div>
          </header>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="tweak-row">
              <label className="tweak-label">Raison sociale</label>
              <input className="input" defaultValue="Atelier Marchand" />
            </div>
            <div className="tweak-row">
              <label className="tweak-label">SIREN</label>
              <input className="input" defaultValue="852 345 678" />
            </div>
            <div className="tweak-row">
              <label className="tweak-label">Numéro de TVA</label>
              <input className="input" defaultValue="FR85852345678" />
            </div>
          </div>
          <footer className="card-foot">
            <button type="button" className="btn primary sm" style={{ marginLeft: "auto" }}>
              Enregistrer
            </button>
          </footer>
        </article>

        <article className="card">
          <header className="card-head">
            <div className="card-title">Membres</div>
            <span className="card-sub" style={{ marginLeft: "auto" }}>1 membre</span>
          </header>
          <div className="card-body">
            <div className="company-chip">
              <div className="company-avatar">SM</div>
              <div className="company-meta">
                <div className="company-name">Sophie Marchand</div>
                <div className="company-sub">sophie@atelier-marchand.fr · owner</div>
              </div>
            </div>
          </div>
          <footer className="card-foot">
            <button type="button" className="btn sm" style={{ marginLeft: "auto" }}>
              Inviter un membre
            </button>
          </footer>
        </article>
      </div>
    </>
  );
}

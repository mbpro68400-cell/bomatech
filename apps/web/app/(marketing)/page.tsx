import Link from "next/link";

export default function LandingPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Nav */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 32px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark">B</div>
          <div className="brand-name">Bomatech</div>
          <span className="brand-badge">Beta</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/login" className="btn ghost sm">
            Connexion
          </Link>
          <Link href="/login" className="btn primary sm">
            Essayer
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 840, margin: "0 auto", padding: "96px 32px 64px", textAlign: "center" }}>
        <p className="muted" style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 24 }}>
          Copilote financier pour TPE / PME
        </p>
        <h1 className="serif" style={{ fontSize: 60, lineHeight: 1.05, letterSpacing: "-0.03em", margin: "0 0 24px" }}>
          Pilote ta trésorerie,<br />sans être comptable.
        </h1>
        <p className="muted" style={{ fontSize: 18, maxWidth: 560, margin: "0 auto 40px", lineHeight: 1.5 }}>
          Importe tes relevés, simule tes décisions, repère les risques avant
          qu'ils ne coûtent. Bomatech transforme des chiffres en clarté.
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Link href="/login" className="btn accent">Commencer gratuitement</Link>
          <Link href="#features" className="btn ghost">En savoir plus →</Link>
        </div>
      </section>

      {/* Features */}
      <section
        id="features"
        style={{ maxWidth: 1040, margin: "0 auto", padding: "0 32px 96px" }}
      >
        <div className="grid cols-3">
          {[
            {
              title: "État financier en temps réel",
              body: "Trésorerie, runway, marge, TVA : tout au même endroit, toujours à jour.",
            },
            {
              title: "Simulations what-if",
              body: "« Et si je perds mon plus gros client ? » Vois l'impact avant de décider.",
            },
            {
              title: "Alertes explicables",
              body: "Pas de jargon. L'IA t'explique pourquoi un chiffre clignote rouge.",
            },
          ].map((f) => (
            <article key={f.title} className="card">
              <div className="card-body">
                <h3 className="serif" style={{ fontSize: 20, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
                  {f.title}
                </h3>
                <p className="muted" style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>{f.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "24px 32px",
          color: "var(--fg-muted)",
          fontSize: 12,
        }}
      >
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>© 2026 Bomatech</span>
          <span>
            Bomatech est un outil de pilotage. Ce n'est ni un logiciel de
            comptabilité, ni un conseil fiscal.
          </span>
        </div>
      </footer>
    </main>
  );
}

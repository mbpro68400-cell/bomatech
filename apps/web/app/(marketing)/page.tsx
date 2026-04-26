import Link from "next/link";

export default function LandingPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* ==================== NAV ==================== */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "saturate(180%) blur(8px)",
          background: "color-mix(in oklch, var(--bg) 80%, transparent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Link href="/" className="brand" style={{ padding: 0, textDecoration: "none" }}>
          <div className="brand-mark">B</div>
          <div className="brand-name">Bomatech</div>
          <span className="brand-badge">Beta</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 13 }}>
          <a href="#features" className="muted" style={{ textDecoration: "none" }}>Produit</a>
          <a href="#pricing" className="muted" style={{ textDecoration: "none" }}>Tarifs</a>
          <a href="#faq" className="muted" style={{ textDecoration: "none" }}>FAQ</a>
          <Link href="/login" className="btn ghost sm" style={{ textDecoration: "none" }}>
            Connexion
          </Link>
          <Link href="/login" className="btn primary sm" style={{ textDecoration: "none" }}>
            Essayer
          </Link>
        </div>
      </nav>

      {/* ==================== HERO ==================== */}
      <section style={{ maxWidth: 840, margin: "0 auto", padding: "112px 32px 72px", textAlign: "center" }}>
        <p
          className="muted"
          style={{
            fontSize: 12,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          Copilote financier pour TPE / PME
        </p>
        <h1
          className="serif"
          style={{
            fontSize: "clamp(40px, 6vw, 64px)",
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            margin: "0 0 24px",
          }}
        >
          Pilote ta trésorerie,<br />sans être comptable.
        </h1>
        <p
          className="muted"
          style={{
            fontSize: 18,
            maxWidth: 560,
            margin: "0 auto 40px",
            lineHeight: 1.5,
          }}
        >
          Importe tes relevés, simule tes décisions, repère les risques avant
          qu'ils ne coûtent. Bomatech transforme des chiffres en clarté.
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <Link href="/login" className="btn accent" style={{ textDecoration: "none" }}>
            Commencer gratuitement
          </Link>
          <a href="#features" className="btn ghost" style={{ textDecoration: "none" }}>
            En savoir plus →
          </a>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 24 }}>
          Sans carte bancaire · 14 jours d'essai
        </p>
      </section>

      {/* ==================== APERÇU PRODUIT (MOCKUP) ==================== */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "0 32px 96px" }}>
        <div
          style={{
            position: "relative",
            borderRadius: "var(--r-xl)",
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
            overflow: "hidden",
          }}
        >
          {/* Faux topbar de la fenêtre */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--warm-100)",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
            <span className="mono muted" style={{ marginLeft: 16, fontSize: 11 }}>
              bomatech.app/dashboard
            </span>
          </div>

          {/* Contenu : KPIs */}
          <div style={{ padding: "32px 32px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
              <div>
                <p className="muted" style={{ fontSize: 12, margin: "0 0 4px" }}>Atelier Marchand SARL</p>
                <h3 className="serif" style={{ fontSize: 28, margin: 0, letterSpacing: "-0.02em" }}>
                  Tableau de bord
                </h3>
              </div>
              <span className="tag success">Mis à jour il y a 3 min</span>
            </div>

            <div className="grid cols-4" style={{ marginBottom: 24 }}>
              <div className="card">
                <div className="kpi">
                  <div className="kpi-label">Trésorerie</div>
                  <div className="kpi-value">87 420 €</div>
                  <div className="kpi-sub">
                    <span className="delta up">+8,4 %</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="kpi">
                  <div className="kpi-label">Revenus 30j</div>
                  <div className="kpi-value">23 150 €</div>
                  <div className="kpi-sub">
                    <span className="delta up">+12,1 %</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="kpi">
                  <div className="kpi-label">Marge brute</div>
                  <div className="kpi-value">38,2 %</div>
                  <div className="kpi-sub">
                    <span className="delta down">−2 pts</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="kpi">
                  <div className="kpi-label">Runway</div>
                  <div className="kpi-value">8,4 mois</div>
                  <div className="kpi-sub">
                    <span className="muted">au rythme actuel</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mini bar chart en SVG */}
            <div className="card">
              <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Cashflow mensuel</div>
                <div className="muted" style={{ fontSize: 12 }}>12 derniers mois</div>
              </div>
              <div style={{ padding: 18 }}>
                <svg viewBox="0 0 720 140" width="100%" style={{ display: "block" }}>
                  <line x1="0" y1="120" x2="720" y2="120" stroke="var(--border)" strokeDasharray="3 3" />
                  {[
                    { rev: 64, cost: 38 }, { rev: 70, cost: 41 }, { rev: 78, cost: 43 },
                    { rev: 75, cost: 42 }, { rev: 80, cost: 44 }, { rev: 88, cost: 47 },
                    { rev: 86, cost: 48 }, { rev: 82, cost: 46 }, { rev: 90, cost: 49 },
                    { rev: 95, cost: 51 }, { rev: 93, cost: 50 }, { rev: 100, cost: 53 },
                  ].map((d, i) => (
                    <g key={i} transform={`translate(${i * 60 + 10}, 0)`}>
                      <rect x="0" y={120 - d.rev} width="22" height={d.rev} fill="var(--success)" rx="2" />
                      <rect x="26" y={120 - d.cost} width="22" height={d.cost} fill="var(--danger)" rx="2" opacity="0.85" />
                    </g>
                  ))}
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FEATURES BULLETS ==================== */}
      <section
        id="features"
        style={{ maxWidth: 1040, margin: "0 auto", padding: "0 32px 96px" }}
      >
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p
            className="muted"
            style={{
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Ce que tu obtiens
          </p>
          <h2 className="serif" style={{ fontSize: 36, letterSpacing: "-0.02em", margin: 0 }}>
            Trois leviers, une seule app.
          </h2>
        </div>
        <div className="grid cols-3">
          {[
            {
              title: "État financier en temps réel",
              body: "Trésorerie, runway, marge, TVA : tout au même endroit, toujours à jour. Pas d'export Excel à refaire chaque lundi.",
            },
            {
              title: "Simulations what-if",
              body: "« Et si je perds mon plus gros client ? » « Si j'embauche ? » Vois l'impact sur 6 ou 12 mois avant de décider.",
            },
            {
              title: "Alertes explicables",
              body: "Pas de jargon. L'IA t'explique pourquoi un chiffre clignote rouge, et ce que tu peux faire concrètement.",
            },
          ].map((f) => (
            <article key={f.title} className="card">
              <div className="card-body">
                <h3 className="serif" style={{ fontSize: 20, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
                  {f.title}
                </h3>
                <p className="muted" style={{ fontSize: 14, lineHeight: 1.55, margin: 0 }}>
                  {f.body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ==================== COMPARAISON ==================== */}
      <section
        style={{
          background: "var(--warm-100)",
          padding: "96px 32px",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p
              className="muted"
              style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}
            >
              Bomatech vs expert-comptable
            </p>
            <h2 className="serif" style={{ fontSize: 36, letterSpacing: "-0.02em", margin: "0 0 12px" }}>
              On ne remplace pas ton comptable.
            </h2>
            <p className="muted" style={{ fontSize: 16, maxWidth: 580, margin: "0 auto", lineHeight: 1.5 }}>
              On lui laisse les déclarations. On te donne la vision.
            </p>
          </div>

          <div className="grid cols-2">
            <article className="card">
              <header className="card-head">
                <div className="card-title">Expert-comptable</div>
                <span className="tag muted" style={{ marginLeft: "auto" }}>Indispensable</span>
              </header>
              <div className="card-body">
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: "var(--fg)" }}>
                  <li>Bilan, liasse fiscale, TVA officielle</li>
                  <li>Conseil fiscal et juridique personnalisé</li>
                  <li>Gestion de la paie</li>
                  <li>Représentation devant l'administration</li>
                </ul>
                <p className="muted" style={{ fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
                  Réservé aux experts-comptables agréés. Garde-le.
                </p>
              </div>
            </article>

            <article className="card" style={{ borderColor: "var(--accent)" }}>
              <header className="card-head">
                <div className="card-title">Bomatech</div>
                <span className="tag accent" style={{ marginLeft: "auto" }}>Tous les jours</span>
              </header>
              <div className="card-body">
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: "var(--fg)" }}>
                  <li>Trésorerie en temps réel</li>
                  <li>Simulations de décisions concrètes</li>
                  <li>Alertes anticipées (cash, marge, clients)</li>
                  <li>Lecture en français, sans jargon</li>
                </ul>
                <p className="muted" style={{ fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
                  Pour piloter, pas pour déclarer.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ==================== SÉCURITÉ ==================== */}
      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "96px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p
            className="muted"
            style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}
          >
            Sécurité &amp; conformité
          </p>
          <h2 className="serif" style={{ fontSize: 36, letterSpacing: "-0.02em", margin: 0 }}>
            Tes données restent chez toi.
          </h2>
        </div>

        <div className="grid cols-3">
          {[
            {
              tag: "Hébergement",
              title: "Serveurs en France & UE",
              body: "Infrastructure hébergée chez des prestataires européens conformes RGPD. Aucune donnée ne quitte l'UE.",
            },
            {
              tag: "Banque",
              title: "Connexion DSP2 agréée",
              body: "Accès aux comptes via un agrégateur AISP agréé par l'ACPR. Tu peux révoquer à tout moment.",
            },
            {
              tag: "Chiffrement",
              title: "TLS + AES-256 au repos",
              body: "Communications chiffrées en TLS. Données sensibles chiffrées en base. Audit log sur toute modification.",
            },
            {
              tag: "RGPD",
              title: "Droits respectés, point.",
              body: "Accès, rectification, effacement, portabilité. Rétention 10 ans pour les données comptables (obligation légale).",
            },
            {
              tag: "Open source",
              title: "Code auditable",
              body: "Les moteurs de calcul sont open source. Pas de boîte noire. Tu peux vérifier comment chaque KPI est calculé.",
            },
            {
              tag: "Réversibilité",
              title: "Export à tout moment",
              body: "CSV, FEC pour ton comptable, ou API. Pas de lock-in. Si tu pars, tu pars avec toutes tes données.",
            },
          ].map((s) => (
            <article key={s.title} className="card">
              <div className="card-body">
                <span
                  className="tag muted"
                  style={{ fontSize: 10, marginBottom: 12, display: "inline-block" }}
                >
                  {s.tag}
                </span>
                <h3 style={{ fontSize: 15, margin: "0 0 8px", fontWeight: 600 }}>{s.title}</h3>
                <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                  {s.body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ==================== PRICING ==================== */}
      <section
        id="pricing"
        style={{
          background: "var(--warm-100)",
          padding: "96px 32px",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p
              className="muted"
              style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}
            >
              Tarifs
            </p>
            <h2 className="serif" style={{ fontSize: 36, letterSpacing: "-0.02em", margin: "0 0 12px" }}>
              Simple, sans surprise.
            </h2>
            <p className="muted" style={{ fontSize: 16, maxWidth: 540, margin: "0 auto", lineHeight: 1.5 }}>
              Commence gratuitement, paie quand ton équipe grandit.
            </p>
          </div>

          <div className="grid cols-3">
            <article className="card">
              <div className="card-body" style={{ padding: 24 }}>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>Gratuit</h3>
                  <p className="muted" style={{ fontSize: 13, margin: 0 }}>Pour découvrir</p>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 20 }}>
                  <span className="serif" style={{ fontSize: 40, letterSpacing: "-0.02em" }}>0 €</span>
                  <span className="muted" style={{ fontSize: 13 }}>/ mois</span>
                </div>
                <ul style={{ margin: "0 0 24px", paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: "var(--fg)" }}>
                  <li>1 entreprise</li>
                  <li>Import CSV illimité</li>
                  <li>Dashboard temps réel</li>
                  <li>Historique 90 jours</li>
                </ul>
                <Link
                  href="/login"
                  className="btn ghost"
                  style={{ width: "100%", textDecoration: "none", justifyContent: "center" }}
                >
                  Commencer
                </Link>
              </div>
            </article>

            <article
              className="card"
              style={{ borderColor: "var(--accent)", boxShadow: "var(--shadow-md)", position: "relative" }}
            >
              <span
                className="tag accent"
                style={{
                  position: "absolute",
                  top: -10,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "var(--accent)",
                  color: "var(--accent-fg)",
                  fontSize: 10,
                }}
              >
                Le plus populaire
              </span>
              <div className="card-body" style={{ padding: 24 }}>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>Pro</h3>
                  <p className="muted" style={{ fontSize: 13, margin: 0 }}>Pour les TPE actives</p>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 20 }}>
                  <span className="serif" style={{ fontSize: 40, letterSpacing: "-0.02em" }}>29 €</span>
                  <span className="muted" style={{ fontSize: 13 }}>/ mois HT</span>
                </div>
                <ul style={{ margin: "0 0 24px", paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: "var(--fg)" }}>
                  <li>Tout du gratuit, plus :</li>
                  <li>Connexion bancaire DSP2</li>
                  <li>OCR factures PDF</li>
                  <li>Simulations illimitées</li>
                  <li>Alertes IA en français</li>
                  <li>Export FEC pour ton comptable</li>
                  <li>Historique illimité</li>
                </ul>
                <Link
                  href="/login"
                  className="btn accent"
                  style={{ width: "100%", textDecoration: "none", justifyContent: "center" }}
                >
                  Essai 14 jours
                </Link>
              </div>
            </article>

            <article className="card">
              <div className="card-body" style={{ padding: 24 }}>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>Entreprise</h3>
                  <p className="muted" style={{ fontSize: 13, margin: 0 }}>Multi-entités, équipes</p>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 20 }}>
                  <span className="serif" style={{ fontSize: 40, letterSpacing: "-0.02em" }}>Sur devis</span>
                </div>
                <ul style={{ margin: "0 0 24px", paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: "var(--fg)" }}>
                  <li>Tout du Pro, plus :</li>
                  <li>Plusieurs sociétés</li>
                  <li>Membres illimités</li>
                  <li>Rôles personnalisés</li>
                  <li>SSO (SAML)</li>
                  <li>Support dédié</li>
                  <li>SLA 99,9 %</li>
                </ul>
                <a
                  href="mailto:contact@bomatech.app"
                  className="btn ghost"
                  style={{ width: "100%", textDecoration: "none", justifyContent: "center" }}
                >
                  Nous contacter
                </a>
              </div>
            </article>
          </div>

          <p className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 32 }}>
            Tarifs en € HT. Paiement mensuel ou annuel (−15 %). Sans engagement, résiliable à tout moment.
          </p>
        </div>
      </section>

      {/* ==================== FAQ ==================== */}
      <section id="faq" style={{ maxWidth: 800, margin: "0 auto", padding: "96px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p
            className="muted"
            style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}
          >
            Questions fréquentes
          </p>
          <h2 className="serif" style={{ fontSize: 36, letterSpacing: "-0.02em", margin: 0 }}>
            Avant de te lancer.
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            {
              q: "Bomatech remplace-t-il mon expert-comptable ?",
              a: "Non. Bomatech est un outil de pilotage, pas un logiciel de comptabilité. Ton expert-comptable reste indispensable pour les déclarations fiscales, le bilan, la TVA officielle et le conseil personnalisé. Bomatech te donne la vision en temps réel pour les décisions du quotidien.",
            },
            {
              q: "Mes données bancaires sont-elles en sécurité ?",
              a: "Oui. La connexion bancaire passe par un agrégateur agréé AISP par l'ACPR. On ne stocke jamais tes identifiants bancaires. Tu peux révoquer l'accès à tout moment, et toutes les communications sont chiffrées en TLS.",
            },
            {
              q: "Combien de temps pour mettre en place ?",
              a: "5 minutes pour le gratuit (import CSV). 15 minutes pour le Pro avec connexion bancaire (OAuth direct avec ta banque). Aucune installation, aucun paramétrage compta préalable.",
            },
            {
              q: "Mon expert-comptable peut-il accéder à mes données ?",
              a: "Oui, tu peux l'inviter en lecture seule (plan Pro et Entreprise). Il accède à tes chiffres en temps réel, peut télécharger le FEC pour ses propres outils, et tu gardes la main sur les permissions.",
            },
            {
              q: "Que se passe-t-il si j'arrête mon abonnement ?",
              a: "Tu gardes l'accès en lecture seule pendant 30 jours pour exporter tes données (CSV, FEC). Au-delà, les données sont supprimées sauf demande contraire. Pas de lock-in : tout ce que tu as importé t'appartient.",
            },
            {
              q: "Pourquoi vous êtes en français uniquement ?",
              a: "Parce qu'on optimise pour les spécificités françaises (TVA, FEC, factur-X, DSP2, formes juridiques SARL/SAS). Une version multi-pays viendra plus tard.",
            },
            {
              q: "L'IA invente-t-elle des chiffres ?",
              a: "Non. L'IA ne fait jamais de calcul — elle reçoit du JSON structuré et produit du texte explicatif. Chaque nombre dans une explication est vérifié contre la source. Si l'IA tente d'inventer, le système bascule sur une explication déterministe automatiquement.",
            },
          ].map((item, i) => (
            <details key={i} className="card" style={{ padding: "16px 20px", cursor: "pointer" }}>
              <summary
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  listStyle: "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                {item.q}
                <span className="muted" style={{ fontSize: 18, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                  +
                </span>
              </summary>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, margin: "12px 0 0", paddingRight: 24 }}>
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section style={{ background: "var(--warm-900)", color: "var(--warm-50)", padding: "96px 32px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <h2
            className="serif"
            style={{
              fontSize: 44,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
              margin: "0 0 16px",
              color: "var(--warm-50)",
            }}
          >
            Prêt à voir clair dans tes chiffres ?
          </h2>
          <p style={{ fontSize: 17, color: "var(--warm-300)", lineHeight: 1.5, margin: "0 0 36px" }}>
            14 jours gratuits, pas de carte bancaire, pas d'engagement.
          </p>
          <Link
            href="/login"
            className="btn"
            style={{
              background: "var(--warm-50)",
              color: "var(--warm-900)",
              fontWeight: 500,
              textDecoration: "none",
              padding: "12px 24px",
              fontSize: 15,
            }}
          >
            Commencer maintenant →
          </Link>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer
        style={{
          background: "var(--warm-900)",
          color: "var(--warm-400)",
          padding: 32,
          borderTop: "1px solid var(--warm-800)",
          fontSize: 12,
        }}
      >
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div className="brand" style={{ padding: 0, color: "var(--warm-200)" }}>
            <div className="brand-mark" style={{ background: "var(--warm-700)", color: "var(--warm-50)" }}>
              B
            </div>
            <span style={{ fontWeight: 500 }}>Bomatech</span>
            <span style={{ marginLeft: 8 }}>© 2026</span>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <a href="#" style={{ color: "var(--warm-400)", textDecoration: "none" }}>CGU</a>
            <a href="#" style={{ color: "var(--warm-400)", textDecoration: "none" }}>Confidentialité</a>
            <a href="#" style={{ color: "var(--warm-400)", textDecoration: "none" }}>Mentions légales</a>
            <a href="mailto:contact@bomatech.app" style={{ color: "var(--warm-400)", textDecoration: "none" }}>
              Contact
            </a>
          </div>
        </div>
        <div style={{ maxWidth: 1040, margin: "24px auto 0", color: "var(--warm-500)", fontSize: 11, lineHeight: 1.6 }}>
          Bomatech est un outil de pilotage. Ce n'est ni un logiciel de comptabilité, ni un conseil fiscal personnalisé.
          Pour vos déclarations fiscales et obligations comptables, consultez votre expert-comptable.
          La connexion bancaire passe par un agrégateur AISP agréé ACPR.
        </div>
      </footer>
    </main>
  );
}

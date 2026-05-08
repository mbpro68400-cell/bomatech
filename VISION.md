# Bomatech — Vision V1

> Source de vérité sur ce que sera Bomatech V1.0 quand "fini". Document stratégique, mis à jour rarement (versions trimestrielles). Pour l'avancement et les milestones, voir `ROADMAP.md`.

## Promesse produit

Bomatech est le **copilote financier des dirigeants de TPE/PME françaises** (SARL, SAS, EURL). Tu connectes ta banque une fois, l'outil te montre en temps réel où tu en es financièrement, t'alerte avant que ça vrille, et te laisse simuler tes décisions — en français, sans jargon, avec garantie anti-hallucination IA.

**Cible** : 0 à 50 salariés, CA 100k€ à 10M€. Marché France uniquement pour V1.

## Piliers fonctionnels V1

### 🔌 1. Connecter sa donnée
- Connexion bancaire **DSP2 via Bridge** (200+ banques FR/EU, sync auto quotidien)
- Import CSV banques (fallback pour banques non couvertes)
- Import factures (PDF, factur-X)
- Import FEC (export comptable)
- Sync lecture avec Pennylane / Indy (en backlog)

### 📊 2. Comprendre sa situation
- Trésorerie courante + projection 30/60/90 jours
- Runway en mois
- Marges (brute / nette) par client / produit / projet
- TVA collectée vs déductible, échéances
- Concentration client (top 3 en % du CA)
- Charges récurrentes (détection automatique)

### 🚨 3. Anticiper les risques
- Alertes seuils : marge négative, concentration > 30%, trésorerie sous critique
- Anomalies de transactions (doublons, montants suspects)
- Échéances fiscales (TVA, URSSAF, IS)
- **Surveillance santé juridique fournisseurs (Quadrimarket)** : Pappers + alertes procédures collectives + scoring prédictif de défaillance

### 🎯 4. Simuler avant de décider
- What-if scenarios : embauche, perte de client, hausse prix, changement de forme juridique
- Comparaison de scénarios côte à côte
- Impact sur runway, marge, trésorerie

### 🤖 5. IA conversationnelle
- **Chatbot financier actif** : tu poses tes questions ("pourquoi ma marge a baissé en mars ?"), il répond avec données et sources
- **IA anti-hallucination** : aucun chiffre généré sans validation déterministe (regex FR + tolérance 2%, fallback explicatif si confiance < 0.95)
- Le LLM ne calcule jamais, il explique des chiffres calculés par les engines

### 🤝 6. Collaboration
- Multi-utilisateurs avec rôles : `owner` / `admin` / `viewer` / `accountant`
- **Annotations** sur transactions et indicateurs
- **Mentions @** entre membres de l'entreprise
- **Workflow de validation** sur actions sensibles (export, partage externe)
- Invitations par email avec onboarding guidé

### 📤 7. Communication & export
- Rapport mensuel auto par email (1 page, français, sans jargon)
- Export PDF / Excel pour expert-comptable
- Partage de tableaux de bord en lecture (lien public temporaire ou compte invité)

## Différenciation produit (ce qui rend Bomatech unique)

- **IA fiable** : zéro hallucination sur les chiffres (validators déterministes)
- **Français sans jargon** : "trésorerie qui se vide en 4 mois", pas "burn rate accelerating"
- **Spécifique France** : TVA, FEC, factur-X, DSP2, formes juridiques FR
- **Conseils contextuels** : pas juste afficher des chiffres, mais suggérer des actions
- **Architecture event-sourcing** : audit trail complet, jamais de donnée mutée

## Plateformes

- **V1** : web responsive (desktop-first, mobile lisible)
- **V2+** : apps natives iOS et Android (décidées comme évolution, hors V1)

## Pricing prévu

- **Free** : 1 entreprise, import CSV, dashboard de base, sans IA conversationnelle
- **Pro 29€/mois HT** (–15% en annuel) : DSP2 Bridge, alertes, simulations, chatbot IA, Quadrimarket, multi-utilisateurs, rapports auto
- **Entreprise** sur devis : multi-sociétés, API, audit logs, SSO, support dédié

## Hors-scope V1 (ce que Bomatech NE FERA PAS)

- ❌ Comptabilité (l'expert-comptable reste indispensable)
- ❌ Facturation client (Pennylane/Tiime le font mieux)
- ❌ Paiement de fournisseurs (Qonto/Shine le font)
- ❌ Conseil fiscal (responsabilité légale, pas le métier)
- ❌ Marchés hors France (Belgique/Suisse/Maroc à étudier en V3+)

## Horizons V2+ (post-V1)

À traiter une fois la V1 stable et rentable :
- Apps natives iOS/Android
- Connexion bancaire en direct (devenir TPP nous-mêmes pour intégrer le paiement)
- Agent IA autonome (prépare et propose des actions, ex : dossier de report TVA)
- Internationalisation : Belgique (similarités juridiques) puis Suisse, Maroc
- API publique pour partenaires (experts-comptables, banques, accélérateurs)
- Module trésorerie avancé (multi-comptes, multi-devises pour les filiales)

---

*Dernière mise à jour : 2026-05-08*
*Décisions prises avec Mag (founder) lors de la session du 8 mai 2026*

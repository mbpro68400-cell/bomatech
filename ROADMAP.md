# Bomatech — Roadmap

## Done
- **1.0 — Bootstrap & déploiement Vercel monorepo** ✅ (2026-04-26)
  - Initial commit (`619ffa2`), 12 commits de config Vercel pnpm/lockfile/Root Directory, upgrade Next 16.2.4 + React 19.2.5 (`232bfba`). Solution finale : `pnpm-lock.yaml` + `.npmrc` racine, Root Directory = `apps/web`, zéro override Vercel (`890c8fb`).
- **1.1 — Frontend public** ✅ (2026-04-26)
  - Landing 8 sections : hero, mockup, features, comparison, sécurité, pricing, FAQ, CTA, footer (`18f3ebb`).
  - Dashboard avec import CSV + Supabase persistence (`888a9ab`).
- **1.2 — Auth magic link** ✅ (2026-04-26, SHA `fe14a3e`)
  - Route `/auth/callback` exchange `?code=xxx` via `exchangeCodeForSession` (`39dc844`), `emailRedirectTo` → `/auth/callback?next=/dashboard`. Marqué "verified in prod" par `b1883c7` puis `47c4793`.
- **Migration projet Supabase** (2026-05-08)
  - Ancien projet `tzufjsdkbrgottnrncrq` passé "Unhealthy" puis NXDOMAIN. Recréé sous `fyxarxbsoxjczzfroqxe`.
  - Schéma `0001_initial.sql` ré-appliqué via SQL Editor. Vercel env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) mises à jour pour Production/Preview/Development. Supabase Auth Redirect URLs reconfigurées (Site URL `https://bomatech.vercel.app`, allow list `/auth/callback`, `localhost:3000`).
  - ⚠️ La prod runtime était cassée silencieusement entre la disparition de l'ancien projet et aujourd'hui (build Vercel "Ready" mais auth/DB runtime KO car `tzuf...` non résolu DNS).
- **1.3 — Création company SARL en DB** ✅ (2026-05-08)
  - User `contact@bomatech.fr` créé via `auth.admin.createUser` (id `7d41fa8a-5732-4cc5-af8d-cde2bbe59e87`).
  - Company `Bomatech SARL (test)` (id `a1b2c3d4-e5f6-7890-abcd-ef1234567890`, SIREN fictif `123456789`, TVA `FR51123456789`, plan `trial`) + `company_members` rôle `owner`.
  - Seed adapté SAS → SARL dans `database/seeds/setup_test_company.sql` (cohérent avec ROADMAP). Données fictives, à remplacer par les vraies infos d'entreprise quand on attaquera la prod réelle.
- **Housekeeping** (2026-05-08) — `.claude/` ignored (`83e7b11`), tsconfig include `.next/dev/types` pour Next 16 turbopack (`8f69f3b`), `.vercel/` et `.env*.local` ignorés racine + `apps/web/`.
- **1.4 — Imports relevés bancaires CIC** ✅ (2026-05-08)
  - CSV CIC déjà en place (`apps/web/lib/csv/cic-parser.ts`).
  - Ajout du parser PDF CIC (`apps/web/lib/pdf/cic-parser.ts`) via `unpdf` : extraction text+coords, détection dynamique de la frontière débit/crédit depuis le header, agglutination des transactions multi-lignes, routage des refs CIC techniques (VGxxxx, RUM, ICS, mandats SEPA) vers `source_ref`. Validé sur extraits réels (avril 2024 + juillet 2024 + janvier 2025), 179 transactions avec totaux conformes au PDF.
  - Page `/imports` : drag-drop CSV ou PDF, dispatch par extension, preview + insert.
  - Dédup à l'insert sur `(company_id, source_ref)` : re-importer un même PDF n'insère pas de doublons, le compte de doublons ignorés est affiché à l'utilisateur.
  - Ordre stable des transactions : `date DESC, created_at DESC, id ASC` + stampage `created_at` séquentiel à l'insert pour préserver l'ordre du PDF intra-jour.
- **1.5 (partiel) — Page transactions câblée Supabase** ✅ (2026-05-08)
  - Remplacement du DEMO hardcodé par `listTransactions` + filtres Toutes/Revenus/Charges/Taxes.
  - Empty state si la company n'a aucune transaction. Loading state.
  - Sidebar : badge `"2"` hardcodé sur Imports retiré (était un placeholder de mockup).

## In progress
- **1.6 — Factures émises** (Phases 1-2 en cours, 2026-05-08)
  - **Phase 1 ✅** — schéma + saisie manuelle. Migration `0002_invoices_emitted.sql` appliquée dans Supabase. Table `invoices_emitted`, RLS company-scoped, page `/invoices` avec formulaire + liste + filtres (Toutes/À payer/En retard/Payées) + actions (marquer payée, annuler, supprimer). V1 simplifiée : paiement total uniquement (1 facture ↔ 1 transaction max).
  - **Phase 2 ✅** — import CSV. Parser flexible avec aliases FR/EN auto-détectés (numero/client/ht/tva/taux_tva/echeance/…), résolution des montants (HT+rate, HT+TVA, TTC+rate, TTC+TVA), dates ISO ou DD/MM/YYYY. Dédup pré-insert sur `(company_id, number)`. UI inline sur `/invoices`. Excel `.xlsx` reporté en V1.5 (le user exporte en CSV depuis Excel/Pennylane/Tiime).
  - **Phase 3 ✅** — import PDF unitaire + ZIP en lot. Décision : **regex pur côté client** (pas de LLM, 0 coût, 0 dépendance API). Calibré sur les factures Dext (format observé sur l'échantillon réel). Validators déterministes (HT+TVA=TTC ±1c, vat_rate ∈ {0, 0.055, 0.10, 0.20}, dates parsables, issued ≤ due, fenêtre raisonnable). Si validators OK → import direct ; si KO → formulaire manuel pré-rempli + warnings (jamais d'auto-création silencieuse de facture incomplète). PDF scanné (texte < 50 chars) → refus propre. ZIP : `jszip` browser-side, limites strictes 50 MB / 100 fichiers / 200 MB décompressé / 10 MB par fichier / extensions `.pdf` `.csv` whitelistées / paths suspects skip / zip-bomb stop early. Recap UI : prêts auto-importés, à vérifier listés, ignorés/erreurs détaillés.
  - **Phase 4 (ex-3)** — rapprochement automatique facture ↔ transaction bancaire avec scoring (montant ±1%, fenêtre temporelle, nom client / n° facture dans libellé). Trois branches explicites : match auto si score ≥ 0.90, suggestion à confirmer si 0.60 ≤ score < 0.90, **pas de match silencieux en cas de mismatch montant** (underpayment → flag « paiement partiel suspecté », overpayment → flag « trop-perçu »).
  - **Phase 5 (ex-4)** — DSO + alerte impayé sur dashboard (alert_type `payment_delay` déjà prévu dans le schéma initial).
  - **V1.5** — (a) OCR Tesseract pour PDFs scannés (catégorie image-only) ; (b) **fallback LLM Claude Haiku 4.5 + tool_use** pour les formats de factures que le regex ne couvre pas (fournisseurs autres que Dext) ; (c) Excel `.xlsx` natif.
  - **V2** — factur-X (PDF/A-3 + XML embedded), obligation FR 2026/2027.

## Next
- **1.5 (suite) — Pages restantes** : `/insights` (encore en DEMO), `/analytics`, `/simulate`, `/closing`, `/export`, `/settings` (placeholders ou semi-implémentées) à câbler ou supprimer selon priorité.

## Backlog (non priorisé)
- **Paiements partiels sur factures (V2)** : nouvelle table `invoice_payments(invoice_id, transaction_id, amount_cents, paid_at)`. Permettra qu'une facture soit liée à plusieurs transactions et qu'on suive un solde restant. Volontairement reporté en V2 pour ne pas alourdir la V1. Voir `database/migrations/0002_invoices_emitted.sql` (notice V1 SCOPE).
- **Module Quadrimarket** (vérification/surveillance santé juridique des fournisseurs via Pappers + scoring prédictif). Décidé en mai 2026 comme module DANS Bomatech, pas produit séparé. À planifier après 1.5/1.6.
- **Stripe integration** (paiement Pro 29€/mois HT, plan annuel −15%).
- **Engines API hosting sur Fly.io** (engines Python actuellement en port TS dans `apps/web/lib/engines/`).

## Tech debt connue (mai 2026)
- **Mismatch `react: 19.2.5` vs `@types/react: ^18.3.12`** → casse `lucide-react` sur `components/sidebar.tsx`. Fix : `pnpm up @types/react @types/react-dom -L`.
- **Types implicit `any` sur cookies `@supabase/ssr`** : `apps/web/app/auth/callback/route.ts`, `apps/web/lib/supabase.ts`, `apps/web/middleware.ts`. Fix : annoter avec `CookieMethodsServer` / `CookieOptions` du package.
- **`typescript: { ignoreBuildErrors: true }` confirmé** dans `apps/web/next.config.ts:9` (avec TODO sur lucide-react R19). Idem `eslint: { ignoreDuringBuilds: true }` ligne 12. Le build "Ready" Vercel masque toute la dette TS/lint.
- **Pas de script `typecheck`** dans `apps/web/package.json` (à ajouter : `"typecheck": "tsc --noEmit -p tsconfig.json"`).
- **Next 16 breaking change** sur `eslint` dans `next.config.ts` : type `NextConfig` ne déclare pas la propriété, runtime OK mais TS2353 au typecheck. Couvert par `ignoreBuildErrors`.

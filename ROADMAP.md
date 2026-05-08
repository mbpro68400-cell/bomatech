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

## In progress
_(rien)_

## Next
- **1.4 — Test import CSV CIC en prod** avec un vrai relevé bancaire.
- **1.5 — Dashboard / Analytics / Simulate / Imports** : déblocages cascade post-auth (à valider feature par feature).

## Backlog (non priorisé)
- **Module Quadrimarket** (vérification/surveillance santé juridique des fournisseurs via Pappers + scoring prédictif). Décidé en mai 2026 comme module DANS Bomatech, pas produit séparé. À planifier après 1.5.
- **Stripe integration** (paiement Pro 29€/mois HT, plan annuel −15%).
- **Engines API hosting sur Fly.io** (engines Python actuellement en port TS dans `apps/web/lib/engines/`).

## Tech debt connue (mai 2026)
- **Mismatch `react: 19.2.5` vs `@types/react: ^18.3.12`** → casse `lucide-react` sur `components/sidebar.tsx`. Fix : `pnpm up @types/react @types/react-dom -L`.
- **Types implicit `any` sur cookies `@supabase/ssr`** : `apps/web/app/auth/callback/route.ts`, `apps/web/lib/supabase.ts`, `apps/web/middleware.ts`. Fix : annoter avec `CookieMethodsServer` / `CookieOptions` du package.
- **`typescript: { ignoreBuildErrors: true }` confirmé** dans `apps/web/next.config.ts:9` (avec TODO sur lucide-react R19). Idem `eslint: { ignoreDuringBuilds: true }` ligne 12. Le build "Ready" Vercel masque toute la dette TS/lint.
- **Pas de script `typecheck`** dans `apps/web/package.json` (à ajouter : `"typecheck": "tsc --noEmit -p tsconfig.json"`).
- **Next 16 breaking change** sur `eslint` dans `next.config.ts` : type `NextConfig` ne déclare pas la propriété, runtime OK mais TS2353 au typecheck. Couvert par `ignoreBuildErrors`.

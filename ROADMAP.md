# Bomatech — Roadmap

## Done
- **1.0 — Bootstrap & déploiement Vercel monorepo** ✅ (2026-04-26)
  - Initial commit (`619ffa2`), 12 commits de config Vercel pnpm/lockfile/Root Directory, upgrade Next 16.2.4 + React 19.2.5 (`232bfba`). Solution finale : `pnpm-lock.yaml` + `.npmrc` racine, Root Directory = `apps/web`, zéro override Vercel (`890c8fb`).
- **1.1 — Frontend public** ✅ (2026-04-26)
  - Landing 8 sections : hero, mockup, features, comparison, sécurité, pricing, FAQ, CTA, footer (`18f3ebb`).
  - Dashboard avec import CSV + Supabase persistence (`888a9ab`).
- **1.2 — Auth magic link** ✅ (2026-04-26, SHA `fe14a3e`)
  - Route `/auth/callback` exchange `?code=xxx` via `exchangeCodeForSession` (`39dc844`), `emailRedirectTo` → `/auth/callback?next=/dashboard`. Marqué "verified in prod" par `b1883c7` puis `47c4793`.
- **Housekeeping** (2026-05-08) — `.claude/` ignored (`83e7b11`), tsconfig include `.next/dev/types` pour Next 16 turbopack (`8f69f3b`).

## In progress
_(rien de visible côté git, et rien hors-git d'après Mag)_

## Next
- **1.3 — Création company SARL en DB** : `INSERT INTO companies` + `INSERT INTO company_members` liés à `auth.users.id` du compte `contact@bomatech.fr`. ⚠️ Décision "vraies données SIREN/TVA vs anonymisé" à trancher avant exécution.
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

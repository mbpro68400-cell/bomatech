# bomatech — Contexte projet

> Ce fichier sert de mémoire persistante entre les sessions Claude Code et les instructions Opus 4.7 (Claude.ai).
> Lis-le en début de chaque session.

---

## Vision produit

Bomatech est un **copilote financier pour TPE/PME françaises** (SARL, SAS, EURL).

**Promesse** : transformer des données financières brutes en vision claire pour le dirigeant qui n'est pas comptable.
**Positionnement** : outil de pilotage, **PAS** un logiciel de comptabilité ni un service de conseil fiscal.
**Marché** : France uniquement au démarrage (TVA, FEC, factur-X, DSP2, formes juridiques FR).

**Fonctionnalités clés** :
- Import de relevés bancaires (CSV ou DSP2) → calculs en temps réel (trésorerie, runway, marge, TVA)
- Simulations what-if (perte d'un gros client, embauche, hausse charges)
- Alertes explicables en français, sans jargon
- Détection d'anomalies (concentration client, marge négative, hausse coûts)

**Business model** : freemium → Pro 29€/mois HT → Entreprise sur devis. Stripe annual −15%.

---

## Stack technique

- **Framework** : Next.js 15 (App Router) + React 19 stable + TypeScript strict
- **Monorepo** : pnpm workspace
  - `apps/web` — frontend Next.js (déployé sur Vercel)
  - `apps/api` — FastAPI Python (prévu Fly.io, **non déployé**)
  - `packages/engines` — Python pur, calculs financiers (30 tests verts)
  - `packages/ai` — couche LLM avec validators anti-hallucination (11 tests)
  - `packages/ui` — design tokens CSS partagés (`@bomatech/ui`)
- **Design** : pas de Tailwind. Design system custom dans `packages/ui/` (tokens.css + app.css).
  Palette warm (50→900) + accent violet OKLCH `oklch(0.55 0.16 285)`.
  Fonts : Geist + Instrument Serif + Geist Mono.
  Dark mode via `[data-theme="dark"]`. Density via `[data-density="compact"]`.
- **DB** : Supabase Postgres (projet `bomatech-db`, ref `tzufjsdkbrgottnrncrq`, region EU)
- **Auth** : Supabase Auth (`@supabase/ssr`), magic link uniquement
- **Hosting** : Vercel Hobby — `bomatech.vercel.app`
- **Repo** : `https://github.com/mbpro68400-cell/bomatech` (public)

### Engines : architecture event-sourcing

Le coeur métier est en Python (testé) **ET** porté en TypeScript dans `apps/web/lib/engines/` (utilisé en prod).
La logique : `transaction → state immutable → insights via decision rules`.

**Règle d'or** : le LLM ne calcule **JAMAIS**. Il reçoit du JSON structuré et produit du texte explicatif.
Chaque chiffre dans une explication est validé via regex FR (formats `12 345,67 €`) avec tolérance 2%.
Si score validation < 0.95 → fallback sur explication déterministe automatique.

**Money** : tous les montants sont en `bigint cents` (signed). Jamais de float.

---

## État de la base Supabase

- 10 tables avec RLS activée :
  - `profiles`, `companies`, `company_members`
  - `transactions`, `financial_states`, `insights`
  - `simulations`, `forecasts`, `documents`, `audit_log`
- Schéma : `database/migrations/0001_initial.sql` (appliqué)
- User créé : `contact@bomatech.fr` (dans `auth.users`)
- **Pas encore créé** : la `company` correspondant à la SARL réelle de l'utilisateur, ni l'entrée `company_members` qui le lie à cette company

### Variables d'environnement Vercel (déjà configurées)

| Variable | Valeur | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://tzufjsdkbrgottnrncrq.supabase.co` | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (eyJ...) | ✅ |
| `NEXT_PUBLIC_API_URL` | `https://placeholder` | ⚠ placeholder |

### Auth Redirect URLs (Supabase → Authentication → URL Configuration)

- Site URL : `https://bomatech.vercel.app`
- Allow list :
  - `https://bomatech.vercel.app/dashboard`
  - `https://bomatech.vercel.app/login`
  - `https://bomatech.vercel.app/**`
- ⚠ **À ajouter** : `https://bomatech.vercel.app/auth/callback` (nécessaire après le fix de l'issue #1)

---

## Ce qui marche

- ✅ Build Vercel passe en `Ready` (commit `888a9ab` ou plus récent)
- ✅ Landing publique complète (`bomatech.vercel.app`) — 8 sections : hero, mockup dashboard, features, comparison vs expert-comptable, sécurité, pricing, FAQ, CTA, footer
- ✅ Page `/login` affiche le formulaire, magic link **arrive bien** dans la boîte mail
- ✅ Engines TypeScript portés et fonctionnels dans `apps/web/lib/engines/`
- ✅ Parser CSV CIC dans `apps/web/lib/csv/cic-parser.ts` (séparateur `;`, encodage Win-1252, dates `JJ/MM/AAAA`)
- ✅ Pages `/dashboard`, `/imports` codées et branchées sur Supabase via `apps/web/lib/queries/transactions.ts`

## Ce qui ne marche pas

- ❌ **Magic link clic → retour `/login` avec erreur** : la route `/auth/callback` manque
- ❌ **Pas de company SARL en base** → même si l'auth marche, le dashboard affichera "Aucune entreprise associée à ton compte"
- ❌ **Import CSV CIC jamais testé en prod** avec un vrai fichier
- ❌ **API Python non déployée** → toute la logique tourne côté frontend (acceptable pour MVP)

---

## Pièges connus à éviter

À chaque décision technique, garder ces apprentissages des sessions précédentes :

1. **Vercel monorepo pnpm** :
   - Root Directory = `apps/web` dans Settings
   - **AUCUN `vercel.json`** à la racine
   - **AUCUN override** Build/Install/Output Command (laisser Vercel auto-détecter)
   - `pnpm-lock.yaml` doit être commité à la racine
   - `.npmrc` à la racine avec `auto-install-peers=true` et `strict-peer-dependencies=false`
   - Cocher "Include source files outside of the Root Directory in the Build Step"
   - Node 20.x

2. **Supabase Auth + Next.js App Router** :
   - Magic link ne fonctionne PAS avec `emailRedirectTo: ${origin}/dashboard` direct
   - Il faut une route handler `/auth/callback/route.ts` qui appelle `exchangeCodeForSession(code)`
   - Le `emailRedirectTo` doit pointer vers `${origin}/auth/callback?next=/dashboard`
   - Toutes les redirect URLs doivent être dans la allow list Supabase

3. **Argent en code** :
   - `bigint cents` exclusivement, jamais de float
   - Le LLM ne calcule jamais
   - Validators anti-hallucination obligatoires sur tout texte généré par IA

4. **Anti-conneries** :
   - Pas d'ajout de Tailwind sans avoir explicitement validé
   - Pas de mise à jour majeure de dépendance sans tester en local d'abord
   - Pas de `git push --force` sur `main` sans backup explicite
   - Pas de modification du schéma SQL sans migration nommée et numérotée

---

## Workflow Opus + Claude Code

Voir `WORKFLOW.md`.

**Résumé** : Opus 4.7 (dans Claude.ai) rédige des issues GitHub avec le label `opus-directive`.
Claude Code (en local) lit les issues, exécute, push, ferme l'issue.

Les directives Opus arrivent sous forme d'issues structurées (template `.github/ISSUE_TEMPLATE/opus-directive.md`).
Claude Code n'invente pas, il exécute. Si quelque chose est ambigu ou risqué, il pose une question dans l'issue (commentaire) et attend.

---

**Dernière mise à jour** : 2026-04-26

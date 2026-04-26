# Architecture

> Vision technique complète de Bomatech.

## Principe d'or

**Le LLM n'effectue jamais de calcul financier.** Les calculs sont 100% déterministes dans `packages/engines`. L'IA reçoit du JSON structuré et produit du texte.

Pourquoi ? Parce qu'un chiffre faux dans un outil de pilotage financier est bien pire qu'un texte maladroit. Les engines sont testables à l'unité, reproductibles, et auditables. Le LLM, non.

## Flux principal

```
┌─────────────┐
│ Utilisateur │
└──────┬──────┘
       │
       ▼
┌──────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ Next.js 15 (Web) │───▶│ FastAPI (API)   │───▶│ Supabase Postgres │
│ App Router       │    │ Python 3.12     │    │ RLS scoped         │
└──────────────────┘    └────┬─────┬──────┘    └──────────────────┘
                             │     │
                             ▼     ▼
                    ┌───────────┐ ┌───────────┐
                    │ engines   │ │ ai        │
                    │ (Python)  │ │ (Claude)  │
                    └───────────┘ └───────────┘
```

## Packages

### `packages/engines` (cœur métier)

Quatre moteurs purs (aucune I/O) :

1. **Financial State Engine** — state machine incrémentale sur le journal de transactions. `apply(state, tx)` est une fonction pure. `recompute_full()` rebuild depuis zéro (job nocturne).
2. **Forecast Engine** — projette cash/revenue/net sur N mois. Combine EWMA (50%), trend linéaire (30%), saisonnalité (20%). Fallback naïf si historique < 3 mois.
3. **Simulation Engine** — applique des deltas de scénario à une baseline forecast. Invariant critique : `Scenario()` avec tous les deltas à zéro produit la baseline à l'identique.
4. **Decision Engine** — règles déterministes → Insights structurés (avec `facts` dict pour le LLM).

### `packages/ai`

Un `LLMExplainer` avec trois garde-fous anti-hallucination :

- **Extraction de nombres** via regex FR (`87 420`, `38,2%`, `8,4 mois`)
- **Vérification** que chaque nombre présent dans la sortie LLM est dans les `facts` (avec tolérance 2% et dérivations cents↔euros, décimal↔pct)
- **Fallback déterministe** si la validation échoue

### `apps/api`

FastAPI. Chaque endpoint :
1. Authentifie via JWT Supabase
2. Résout la `company_id` via `company_members`
3. Charge l'état / l'historique depuis Postgres
4. Appelle un engine (calcul)
5. Optionnel : appelle le LLM (explication)
6. Retourne JSON

### `apps/web`

Next.js 15 + React 19. App Router, Server Components par défaut. Auth via `@supabase/ssr`. Les pages protégées sont dans le route group `(app)` avec un layout commun (sidebar + topbar).

## Argent

**Tout en centimes, en `bigint` / `int64`.** Jamais de `float`, jamais de `Decimal` dans les hot paths. Conversion à l'affichage via `lib/format.ts` (côté web) ou à l'export CSV.

## Données

### RLS

Activé sur toutes les tables. L'accès est scopé par `company_id` via la fonction SQL `user_company_ids()` (SECURITY DEFINER). Les writes sensibles (`financial_states`, `forecasts`) passent par la service_role depuis le backend.

### Recompute

Deux modes :
- **Incrémental** (`apply`) à chaque nouvelle transaction — rapide, utilisé dans le chemin chaud.
- **Complet** (`recompute_full`) toutes les nuits via `pg_cron` — corrige les dérives éventuelles.

Les deux doivent produire exactement le même résultat (testé dans `test_financial_state.py`).

## Sécurité

- RLS postgres (aucun bypass côté client)
- JWT Supabase vérifié côté API avec `SUPABASE_JWT_SECRET`
- Clés sensibles (Anthropic, Mistral, Bridge) uniquement dans les env vars backend
- Upload : checksum SHA-256 pour éviter les doublons, MIME whitelist
- Audit log pour traçabilité RGPD

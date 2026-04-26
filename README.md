# Bomatech

> Copilote financier intelligent pour TPE / PME.
> Transforme des données financières brutes en vision claire, simulations, prévisions et insights.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Python](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)

---

## 🏗️ Architecture

Monorepo avec séparation stricte frontend / backend / engines / AI / database.

```
bomatech/
├── apps/
│   ├── web/          → Next.js 15 (dashboard SaaS)
│   └── api/          → FastAPI (REST API)
├── packages/
│   ├── engines/      → Python pur (financial state, simulation, decision, forecast)
│   ├── ai/           → LLM layer (Claude) — explication, pas de calcul
│   └── ui/           → Design tokens partagés (CSS)
├── database/
│   ├── migrations/   → Supabase Postgres migrations
│   └── seeds/        → Données de démo
├── docs/             → Architecture, engines, MVP roadmap
└── scripts/          → Outils dev (seed, reset, etc.)
```

### Stack

| Couche | Techno |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, `@bomatech/ui` (design system CSS) |
| Backend | FastAPI, Python 3.12, Pydantic v2 |
| Engines | Python pur (NumPy) — testables sans DB |
| AI | Claude Sonnet 4.6 (Anthropic API) |
| DB / Auth / Storage | Supabase (Postgres 16) |
| OCR | Mistral OCR API |
| Banking | Bridge API (PSD2) |

**Principe** : le LLM **n'effectue jamais** de calcul financier. Il reçoit du JSON structuré et produit du texte. Les calculs sont dans `packages/engines` (100% déterministes, testables).

---

## 🚀 Setup rapide (5 min)

### Prérequis

```bash
node >= 20
pnpm >= 9        # npm i -g pnpm
python >= 3.12
uv               # curl -LsSf https://astral.sh/uv/install.sh | sh
supabase CLI     # npm i -g supabase
```

### 1. Cloner et installer

```bash
git clone https://github.com/<your-org>/bomatech.git
cd bomatech

# Frontend
cd apps/web && pnpm install && cd ../..

# Backend + engines + AI
cd apps/api && uv sync && cd ../..
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

Remplis les variables (voir section [Variables d'environnement](#variables-denvironnement)).

### 3. Lancer Supabase local

```bash
supabase start
supabase db reset          # applique les migrations de database/migrations/
```

### 4. Lancer l'app

Dans 2 terminaux :

```bash
# Terminal 1 — API
cd apps/api && uv run uvicorn app.main:app --reload --port 8000

# Terminal 2 — Web
cd apps/web && pnpm dev
```

Puis ouvre <http://localhost:3000>.

### 5. (Optionnel) Seed de données de démo

```bash
pnpm --filter web seed
# ou : psql $DATABASE_URL < database/seeds/demo_data.sql
```

---

## 📦 Commandes utiles

Les raccourcis sont dans le `Makefile` à la racine :

```bash
make dev           # lance web + api en parallèle
make test          # lance les tests engines + api + web
make lint          # ruff + biome
make migrate       # applique les migrations Supabase
make seed          # charge les données démo
make clean         # reset complet (DB + caches)
```

---

## 🧪 Tests

```bash
# Engines (cœur métier, doit être couvert à 90%+)
cd packages/engines && uv run pytest -v

# API
cd apps/api && uv run pytest -v

# Frontend (Vitest)
cd apps/web && pnpm test
```

---

## 🔐 Variables d'environnement

### Racine (`.env`)

```
NODE_ENV=development
```

### Frontend (`apps/web/.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend (`apps/api/.env`)

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role>
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
ANTHROPIC_API_KEY=sk-ant-...
MISTRAL_API_KEY=...
BRIDGE_CLIENT_ID=...
BRIDGE_CLIENT_SECRET=...
ENVIRONMENT=development
LOG_LEVEL=INFO
```

---

## 🗂️ Roadmap MVP (4 semaines)

- **S1** — Fondations : Supabase schema, auth, import CSV, liste transactions
- **S2** — Financial State Engine + Dashboard (KPI + donut charges)
- **S3** — Simulation Engine + Decision Engine + Insights IA
- **S4** — Forecast Engine + OCR PDF + export CSV

Détails : [docs/mvp.md](./docs/mvp.md).

---

## 🚢 Déploiement

| Composant | Cible | Config |
|---|---|---|
| `apps/web` | Vercel | Auto deploy via Git |
| `apps/api` | Fly.io | `fly deploy` depuis `apps/api/` |
| DB | Supabase Cloud | `supabase db push` |

Voir [docs/deployment.md](./docs/deployment.md).

---

## ⚖️ Contraintes légales

Bomatech est un **outil de pilotage**, pas un logiciel de comptabilité ni un conseil fiscal personnalisé. Voir [docs/legal.md](./docs/legal.md) pour :

- Positionnement produit vs expert-comptable
- Conformité DSP2 (via AISP agréé)
- RGPD (hébergement EU, rétention 10 ans)
- Facture électronique 2026-2027 (Factur-X)

---

## 📖 Documentation

- [Architecture détaillée](./docs/architecture.md)
- [Engines — financial state, simulation, decision, forecast](./docs/engines.md)
- [MVP 4 semaines](./docs/mvp.md)
- [Database schema](./database/README.md)

---

## 📝 License

MIT — voir [LICENSE](./LICENSE).

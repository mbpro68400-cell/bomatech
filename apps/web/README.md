# Bomatech Web

Next.js 15 app — copilote financier intelligent.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- **Styling via `@bomatech/ui`** — design tokens (`tokens.css`) + composants (`app.css`) sont la source de vérité
- Recharts pour les graphiques
- lucide-react pour les icônes
- @supabase/ssr pour l'auth

## Dev

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Ouvre <http://localhost:3000>.

## Pages

| Route | Rôle |
|---|---|
| `/dashboard` | Vue d'ensemble : 4 KPI, cashflow 12 mois, 3 insights IA |
| `/imports` | Sources : CSV, PDF (OCR), connexion bancaire |
| `/transactions` | Liste filtrable des mouvements |
| `/analytics` | KPI N vs N-1, cashflow, évolution CA, top catégories |
| `/simulate` | Simulation what-if (sliders + scénarios) |
| `/insights` | Alertes priorisées du Decision Engine |
| `/closing` | Bilan prévisionnel (avant-clôture) |
| `/export` | Export comptable (EC, FEC) |
| `/settings` | Entreprise, membres |

## Tweaks panel

Bouton flottant en bas à droite. Permet de basculer :
- Accent (5 couleurs : violet, bleu, vert, ambre, rose)
- Thème (clair / sombre)
- Densité (confort / compact)

Ces réglages écrivent les attributs `data-theme`, `data-density` et les CSS vars `--accent*` sur `<html>`. Le design system (`tokens.css`) gère le reste.

## Structure

```
app/
├── (marketing)/        Landing publique
├── (app)/              Shell protégé (sidebar + topbar + tweaks)
│   ├── dashboard/
│   ├── imports/
│   ├── transactions/
│   ├── analytics/
│   ├── simulate/
│   ├── insights/
│   ├── closing/
│   ├── export/
│   └── settings/
└── login/
components/
├── sidebar.tsx
├── topbar.tsx
├── theme-provider.tsx       Driver of data-theme / data-density / accent
├── tweaks-panel.tsx         Floating settings panel
├── kpi-card.tsx
└── charts/
    ├── cashflow-chart.tsx
    ├── revenue-evolution-chart.tsx
    └── top-categories-chart.tsx
lib/
├── api.ts
├── supabase.ts
└── format.ts
```

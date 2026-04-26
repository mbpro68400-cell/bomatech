# MVP — Roadmap 4 semaines

## Semaine 1 — Fondations

- [x] Supabase schema (migrations + RLS)
- [x] Monorepo structure
- [ ] Signup / login (Supabase magic link)
- [ ] Création d'une entreprise
- [ ] Import CSV (relevé bancaire standard)
- [ ] Liste des transactions (filtre + search)

**Livrable** : je peux créer mon compte, importer un CSV, voir mes transactions.

## Semaine 2 — Dashboard

- [x] Financial State Engine (+ tests)
- [ ] Job recompute nocturne (pg_cron)
- [ ] Page dashboard : 4 KPI cards + donut charges
- [ ] Chart trésorerie 30j (Recharts)
- [ ] LLM dashboard summary (+ fallback)

**Livrable** : je vois ma trésorerie, ma marge, mon runway, et un résumé IA en français.

## Semaine 3 — Simulation + Insights

- [x] Simulation Engine (+ tests)
- [x] Decision Engine (+ tests)
- [ ] Page Simulation : sliders + comparaison live (debounce 250ms)
- [ ] Page Insights : liste d'alertes + dismiss
- [ ] Templates de scénarios : "Je perds mon gros client", "J'embauche", "Capex"

**Livrable** : je peux simuler 3 décisions et voir l'impact, et j'ai une liste d'alertes prioritaires.

## Semaine 4 — OCR + Forecast

- [x] Forecast Engine
- [ ] Upload PDF + Mistral OCR (async)
- [ ] Page Upload avec dropzone
- [ ] Déduplication par checksum SHA-256
- [ ] Export CSV des transactions

**Livrable** : je peux glisser une facture PDF, le système l'ingère, et je peux exporter tout pour mon expert-comptable.

## Hors MVP (v2)

- Connexion bancaire live (Bridge PSD2)
- Facturation (Facture électronique 2026-2027, Factur-X)
- Invitation de membres (expert-comptable en viewer)
- Webhooks (notifications critiques)
- Mobile app

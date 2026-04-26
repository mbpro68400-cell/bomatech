# Database — Supabase Postgres

## Structure

```
database/
├── migrations/         # Ordered SQL migrations (0001_, 0002_...)
├── seeds/              # Demo data for local dev
└── functions/          # Edge Functions (TypeScript)
```

## Appliquer les migrations

### Local (Supabase CLI)

```bash
supabase start
supabase db reset        # applies all migrations from migrations/
```

### Production

```bash
supabase link --project-ref <your-ref>
supabase db push
```

## Schéma

| Table | Rôle |
|---|---|
| `profiles` | Profils utilisateurs (étend auth.users) |
| `companies` | Entreprises (SIREN, forme juridique, etc.) |
| `company_members` | Jointure user ↔ company avec role |
| `transactions` | **Source de vérité** — toutes les tx financières |
| `financial_states` | Snapshots dérivés (KPI calculés) |
| `insights` | Alertes du Decision Engine |
| `simulations` | Scénarios what-if sauvegardés |
| `forecasts` | Projections mises en cache |
| `documents` | Fichiers uploadés + résultat OCR |
| `audit_log` | Traçabilité (RGPD) |

## RLS

RLS est activé sur toutes les tables. L'accès est scopé par `company_id` via la fonction `user_company_ids()` qui retourne les entreprises accessibles à l'utilisateur courant.

Les **writes** sur `financial_states`, `forecasts` passent par la service_role (backend uniquement). Les **reads** sont autorisés aux membres de la company.

## Conventions

- Tous les montants sont en **centimes** (bigint). Jamais de float pour l'argent.
- Les timestamps sont en `timestamptz`.
- `updated_at` est géré par trigger sur toutes les tables mutables.
- Les IDs sont des UUID v4.

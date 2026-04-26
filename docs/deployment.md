# Deployment

## Stack

| Composant | Cible | Raison |
|---|---|---|
| `apps/web` | Vercel | Meilleur support Next.js, CDN global |
| `apps/api` | Fly.io | Python natif, scaling horizontal simple |
| Postgres + Auth + Storage | Supabase Cloud | Région EU, RLS, backups auto |
| OCR | Mistral API | Hébergé EU, conforme RGPD |

## Supabase

```bash
supabase link --project-ref <ref>
supabase db push             # applique toutes les migrations
```

Variables à configurer (dashboard Supabase) :

- Auth providers (Email magic link activé par défaut)
- Storage bucket `documents` (public: false)
- Edge functions (pour OCR async, cron recompute)

## Vercel (web)

1. Import le repo depuis GitHub
2. Root directory : `apps/web`
3. Build command : `pnpm build`
4. Install command : `pnpm install --frozen-lockfile`
5. Env vars :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` (URL Fly.io)

## Fly.io (api)

```bash
cd apps/api
fly launch --dockerfile ./Dockerfile --name bomatech-api
fly secrets set \
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  SUPABASE_JWT_SECRET=... \
  ANTHROPIC_API_KEY=... \
  MISTRAL_API_KEY=...
fly deploy
```

## CI/CD

Les workflows GitHub Actions (dans `.github/workflows/`) :

- `engines-ci.yml` : tests + lint Python sur `packages/engines`
- `api-ci.yml` : tests + lint FastAPI
- `web-ci.yml` : build + lint Next.js

Déploiement auto via Vercel (push to main) et Fly.io (via GitHub Action).

## Monitoring

À mettre en place en v2 :
- Sentry (erreurs frontend + backend)
- Axiom ou Logtail (logs structurés)
- Supabase dashboard pour les métriques DB

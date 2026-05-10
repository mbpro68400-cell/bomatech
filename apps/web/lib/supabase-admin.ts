/**
 * Supabase admin client (service_role) — bypass RLS.
 *
 * USAGE STRICT : uniquement dans des routes server-only qui n'ont pas
 * d'utilisateur authentifié dans le contexte (cron jobs, webhooks).
 * Ne JAMAIS importer côté client — la clé `service_role` doit rester
 * exclusivement côté serveur.
 *
 * La garde `import "server-only"` empêche le bundle côté client.
 *
 * Env var requise : SUPABASE_SERVICE_ROLE_KEY (à récupérer dans
 * Supabase Settings → API → service_role secret, JAMAIS en NEXT_PUBLIC_).
 */

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin not configured: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

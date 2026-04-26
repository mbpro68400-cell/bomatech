/**
 * Supabase clients — browser and server variants.
 * Uses @supabase/ssr for proper cookie handling in the App Router.
 */

import { createBrowserClient, createServerClient } from "@supabase/ssr";

let _browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserClient() {
  if (_browserClient) return _browserClient;
  _browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return _browserClient;
}

/** Server Component helper — call from async Server Components. */
export async function getServerClient() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components can't set cookies — middleware handles it.
          }
        },
      },
    },
  );
}

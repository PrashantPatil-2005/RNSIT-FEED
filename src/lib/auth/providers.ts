import "server-only";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Whether Google sign-in is enabled on this Supabase Auth server (public /auth/v1/settings).
 * Used only to show an honest "not available here" state instead of a button that fails.
 */
export async function isGoogleEnabled(): Promise<boolean> {
  const env = getSupabasePublicEnv();
  if (!env) return false;
  try {
    const res = await fetch(`${env.url}/auth/v1/settings`, {
      headers: { apikey: env.anonKey },
      next: { revalidate: 60 },
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { external?: Record<string, unknown> };
    return json.external?.google === true;
  } catch {
    return false;
  }
}

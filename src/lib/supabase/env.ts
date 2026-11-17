/**
 * Supabase and site connection settings.
 *
 * Only the project URL and the anon (publishable) key may ever reach the browser. Both are safe to
 * expose: every table is protected by Row Level Security and explicit grants, and the anon role can
 * read only the public views. The service-role key is never read here, and must never be given a
 * NEXT_PUBLIC_ prefix.
 */
export interface SupabasePublicEnv {
  readonly url: string;
  readonly anonKey: string;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

/** Returns the settings, or null when they are missing or malformed (the UI then shows a notice). */
export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && !isLocalHost(parsed.hostname)) {
      return null; // Plain HTTP is accepted only for the local development stack.
    }
  } catch {
    return null;
  }
  return { url, anonKey };
}

/**
 * The canonical origin of this site (server-only, SITE_URL). OAuth redirects are always built from
 * this value, never from the request's Host header, so a forged Host cannot redirect a sign-in to
 * another domain. Returns null when unset or malformed: sign-in is then disabled (fail closed).
 */
export function getSiteUrl(): URL | null {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && !isLocalHost(u.hostname)) return null;
    if (u.pathname !== "/" || u.search || u.hash) return null;
    return u;
  } catch {
    return null;
  }
}

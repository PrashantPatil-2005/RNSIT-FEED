/**
 * Public Supabase connection settings.
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

/** Returns the settings, or null when they are missing or malformed (the UI then shows a notice). */
export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      parsed.hostname !== "127.0.0.1" &&
      parsed.hostname !== "localhost"
    ) {
      return null; // Plain HTTP is accepted only for the local development stack.
    }
  } catch {
    return null;
  }
  return { url, anonKey };
}

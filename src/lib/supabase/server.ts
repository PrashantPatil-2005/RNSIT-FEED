import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getSupabasePublicEnv } from "./env";

export type DbClient = SupabaseClient<Database>;

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * It uses the anon key plus the visitor's session cookie, so the database sees either `anon` or
 * the signed-in user's `authenticated` role. Authorization is decided by the database (RLS,
 * grants and SECURITY DEFINER functions), never by this code. Returns null when not configured.
 */
export async function createSupabaseServerClient(): Promise<DbClient | null> {
  const env = getSupabasePublicEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. Session refresh happens
          // in the proxy/middleware once authentication is enabled.
        }
      },
    },
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isGoogleEnabled } from "@/lib/auth/providers";
import { safeNextPath } from "@/lib/auth/redirect";
import { getSiteUrl } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Starts Google sign-in (OAuth with PKCE). The code verifier is stored in an httpOnly cookie by
 * @supabase/ssr, and the redirect target is built from SITE_URL, never from the request.
 * Server Actions are POST-only and Next.js rejects cross-origin calls (CSRF protection).
 *
 * No `hd` (hosted domain) hint is sent: the college domain is not confirmed (U1), and `hd` is only
 * a UI hint anyway. Eligibility is enforced by the database guard on sign-up.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next"));
  const site = getSiteUrl();
  const db = await createSupabaseServerClient();
  if (!site || !db) redirect("/auth/error?code=not_configured");
  if (!(await isGoogleEnabled())) redirect("/auth/error?code=provider_unavailable");

  const callback = new URL("/auth/callback", site);
  callback.searchParams.set("next", next);
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      queryParams: { prompt: "select_account" },
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) redirect("/auth/error?code=oauth_failed");
  redirect(data.url);
}

/** Signs out this browser (local scope): revokes the refresh token and clears the cookies. */
export async function signOut(): Promise<void> {
  const db = await createSupabaseServerClient();
  if (db) await db.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout"); // the header (in the root layout) must drop the account controls
  redirect("/?signed_out=1");
}

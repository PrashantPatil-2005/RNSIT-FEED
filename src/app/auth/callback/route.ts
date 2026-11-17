import { NextResponse, type NextRequest } from "next/server";
import { classifyOAuthError, type AuthErrorCode } from "@/lib/auth/errors";
import { homeForRole } from "@/lib/auth/permissions";
import { postSignInPath, safeNextPath } from "@/lib/auth/redirect";
import { getSiteUrl } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth return point. Exchanges the one-time code (PKCE) for a session, then sends the user to
 * onboarding, to their requested destination, or to their role's home page. All redirects use SITE_URL as the base and a validated
 * relative path, so this route cannot be used as an open redirect.
 */
export async function GET(request: NextRequest) {
  const site = getSiteUrl();
  const fail = (code: AuthErrorCode) =>
    NextResponse.redirect(new URL(`/auth/error?code=${code}`, site ?? request.nextUrl.origin));
  if (!site) return fail("not_configured");

  const params = request.nextUrl.searchParams;
  const oauthError = params.get("error");
  if (oauthError) return fail(classifyOAuthError(oauthError, params.get("error_description")));

  const code = params.get("code");
  if (!code || code.length > 512) return fail("missing_code");

  const db = await createSupabaseServerClient();
  if (!db) return fail("not_configured");

  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) return fail("exchange_failed");

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return fail("exchange_failed");

  const { data: profile } = await db
    .from("profiles")
    .select("onboarded_at, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    await db.auth.signOut({ scope: "local" });
    return fail("profile_missing");
  }

  // An explicit safe `next` wins; otherwise each role lands on its own home page (D-R1).
  // New accounts go through onboarding first, keeping any explicit destination.
  const rawNext = params.get("next");
  const destination = profile.onboarded_at
    ? postSignInPath(rawNext, homeForRole(profile.role))
    : rawNext
      ? `/onboarding?next=${encodeURIComponent(safeNextPath(rawNext))}`
      : "/onboarding";
  return NextResponse.redirect(new URL(destination, site));
}

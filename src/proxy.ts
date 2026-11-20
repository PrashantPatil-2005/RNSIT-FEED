import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions } from "@/lib/supabase/cookies";
import { canonicalRedirectUrl } from "@/lib/canonical-host";
import { getSiteUrl, getSupabasePublicEnv } from "@/lib/supabase/env";

/** Pages that need a signed-in user. Everything else stays public (reading is open). */
const PROTECTED_PREFIXES = ["/account", "/onboarding", "/my", "/moderation", "/admin"];
/** Draft editing (/share/<id>) is protected; /share itself shows visitors a sign-in prompt. */
const isProtected = (path: string) =>
  path.startsWith("/share/") ||
  PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Runs before matching requests. It refreshes the Supabase session (rotating tokens and rewriting
 * the httpOnly cookies) and sends signed-out visitors away from protected pages. It is a
 * convenience layer only: every protected page re-checks the user on the server, and the database
 * enforces all permissions itself.
 */
export async function proxy(request: NextRequest) {
  // One origin per deployment, or sign-in breaks (see canonical-host.ts).
  const canonical = canonicalRedirectUrl({
    host: request.headers.get("host"),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    site: getSiteUrl(),
    vercelEnv: process.env.VERCEL_ENV,
  });
  if (canonical) return NextResponse.redirect(canonical, 308);

  const env = getSupabasePublicEnv();
  let response = NextResponse.next({ request });
  if (!env) return response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() validates the token with the Auth server (never trust the cookie contents alone).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && isProtected(path)) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(signIn);
  }
  return response;
}

export const config = {
  // Skip static assets and the OAuth callback (it sets the session itself).
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico|auth/callback).*)"],
};

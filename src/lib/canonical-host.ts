/**
 * Where a request should be sent so the whole site lives on one origin (SITE_URL). Sign-in needs
 * this: the PKCE cookie is set on the host where "Continue with Google" was pressed, and the OAuth
 * callback always returns to SITE_URL. Starting on another host (rnsitfeed.vercel.app, the bare
 * rnsitfeed.in, or localhost instead of 127.0.0.1) would end in a failed sign-in.
 *
 * Returns null when no redirect is needed: already on the canonical host, SITE_URL unset, or a
 * Vercel preview deployment (each preview has its own URL and is used for review only).
 */
export function canonicalRedirectUrl(input: {
  host: string | null;
  pathname: string;
  search: string;
  site: URL | null;
  vercelEnv?: string;
}): URL | null {
  const { host, pathname, search, site, vercelEnv } = input;
  if (!site || !host || vercelEnv === "preview") return null;
  if (host.toLowerCase() === site.host) return null;
  const target = new URL(site.origin);
  target.pathname = pathname;
  target.search = search;
  return target;
}

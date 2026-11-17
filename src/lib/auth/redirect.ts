/**
 * Validates a post-sign-in destination. Only same-site absolute paths are allowed, so a crafted
 * `next` parameter can never send someone to another origin (open redirect). Anything else falls
 * back to the default.
 */
export function safeNextPath(raw: unknown, fallback = "/account"): string {
  if (typeof raw !== "string") return fallback;
  const v = raw.trim();
  if (v.length === 0 || v.length > 200) return fallback;
  if (!v.startsWith("/")) return fallback; // relative or absolute URL with a scheme
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback; // protocol-relative tricks
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return fallback; // control characters, backslashes
  if (v.startsWith("/auth/")) return fallback; // never loop back into the auth flow
  try {
    const u = new URL(v, "http://placeholder.invalid");
    if (u.origin !== "http://placeholder.invalid") return fallback;
    return `${u.pathname}${u.search}`;
  } catch {
    return fallback;
  }
}

/**
 * Destination after sign-in. An explicit, safe `next` path wins (for example the protected page a
 * visitor was trying to open); a missing or unsafe one falls back to `home`, the role's home page
 * from `homeForRole` in permissions.ts.
 */
export function postSignInPath(rawNext: unknown, home: string): string {
  if (typeof rawNext !== "string" || rawNext.trim() === "") return home;
  return safeNextPath(rawNext, home);
}

import type { CookieOptionsWithName } from "@supabase/ssr";
import { getSiteUrl } from "./env";

/**
 * Session cookie hardening. The app never uses a browser Supabase client, so the auth cookies can
 * be httpOnly: page scripts (including any injected script) cannot read the tokens. SameSite=Lax
 * keeps them off cross-site subrequests while still allowing the OAuth return navigation.
 */
export function authCookieOptions(): CookieOptionsWithName {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: getSiteUrl()?.protocol === "https:",
    path: "/",
  };
}

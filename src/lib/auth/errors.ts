/**
 * Sign-in error codes shown on /auth/error. Only these fixed messages are ever displayed: raw
 * provider or database error text is never reflected into the page (it could carry injected
 * content or leak internals).
 */
export const authErrors = {
  not_eligible: {
    title: "This account cannot join",
    body: "Only verified RNSIT college Google accounts can join, and alumni an admin has invited. New sign-ups may also be paused for a while. Nothing was stored. Reading stays open to everyone.",
  },
  oauth_cancelled: {
    title: "Sign-in was cancelled",
    body: "No account was created. You can try again whenever you like.",
  },
  oauth_failed: {
    title: "Sign-in did not complete",
    body: "Google or the sign-in service returned an error. Please try again.",
  },
  missing_code: {
    title: "Sign-in link is incomplete",
    body: "The sign-in response was missing information. Please start again from the sign-in page.",
  },
  exchange_failed: {
    title: "Sign-in link expired or was already used",
    body: "Please start again from the sign-in page. Use the same browser for the whole sign-in.",
  },
  provider_unavailable: {
    title: "Google sign-in is not available here",
    body: "Google sign-in has not been configured for this environment yet.",
  },
  not_configured: {
    title: "Sign-in is not available right now",
    body: "The site is missing part of its configuration. Please try again later.",
  },
  profile_missing: {
    title: "Your profile could not be found",
    body: "Your sign-in worked, but no profile exists for it. Please contact the site team.",
  },
} as const;

export type AuthErrorCode = keyof typeof authErrors;

export function isAuthErrorCode(v: unknown): v is AuthErrorCode {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(authErrors, v);
}

/**
 * Classifies an OAuth error returned to the callback. The before-user-created hook and the
 * database guard reject ineligible accounts; GoTrue reports that as a sign-up error.
 */
export function classifyOAuthError(error: string, description: string | null): AuthErrorCode {
  const d = (description ?? "").toLowerCase();
  if (error === "access_denied" && (d.includes("cancel") || d.includes("denied by user"))) {
    return "oauth_cancelled";
  }
  if (
    d.includes("sign-up is not allowed") ||
    d.includes("signup") ||
    d.includes("database error")
  ) {
    return "not_eligible";
  }
  if (d.includes("provider is not enabled") || d.includes("unsupported provider")) {
    return "provider_unavailable";
  }
  return "oauth_failed";
}

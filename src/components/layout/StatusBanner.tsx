import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { site } from "@/config/site";
import { isGoogleEnabled } from "@/lib/auth/providers";
import { getSiteStatus } from "@/lib/site/status";
import { getSiteUrl } from "@/lib/supabase/env";

/**
 * Honest, site-wide notice about what works today. Follows whether sign-in is switched on, the
 * admin switches, and the admin's notice text (migration 026).
 */
export async function StatusBanner() {
  const [googleOn, status] = await Promise.all([isGoogleEnabled(), getSiteStatus()]);
  const signInOpen = getSiteUrl() !== null && googleOn;
  const paused = [
    status.signupsOpen ? null : "new sign-ups",
    status.postingOpen ? null : "new posts",
    status.commentsOpen ? null : "comments",
  ].filter(Boolean);
  return (
    <div className="status-banner" role="note">
      <Container className="status-banner__inner">
        <strong>Early preview.</strong>
        <span>
          {signInOpen
            ? `Reading is open to everyone. Sign in with your @${site.collegeDomain} Google account to share and take part.`
            : "Reading is open to everyone. Sign-in and posting are not available yet."}
        </span>
        {paused.length ? <span>Paused for now: {paused.join(", ")}.</span> : null}
        {status.notice ? <span className="status-banner__notice">{status.notice}</span> : null}
        <Link href="/disclaimer">Read the disclaimer</Link>
      </Container>
    </div>
  );
}

import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { site } from "@/config/site";
import { isGoogleEnabled } from "@/lib/auth/providers";
import { getSiteUrl } from "@/lib/supabase/env";

/** Honest, site-wide notice about what works today. Follows whether sign-in is switched on. */
export async function StatusBanner() {
  const signInOpen = getSiteUrl() !== null && (await isGoogleEnabled());
  return (
    <div className="status-banner" role="note">
      <Container className="status-banner__inner">
        <strong>Early preview.</strong>
        <span>
          {signInOpen
            ? `Reading is open to everyone. Sign in with your @${site.collegeDomain} Google account to share and take part.`
            : "Reading is open to everyone. Sign-in and posting are not available yet."}
        </span>
        <Link href="/disclaimer">Read the disclaimer</Link>
      </Container>
    </div>
  );
}

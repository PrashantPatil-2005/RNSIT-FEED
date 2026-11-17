import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signInWithGoogle } from "@/app/auth/actions";
import { Container } from "@/components/layout/Container";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { isGoogleEnabled } from "@/lib/auth/providers";
import { safeNextPath } from "@/lib/auth/redirect";
import { getViewer } from "@/lib/auth/session";
import { getSiteUrl } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const raw = (await searchParams).next;
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw);
  const viewer = await getViewer();
  if (viewer) redirect(viewer.profile?.onboarded ? next : "/onboarding");

  const available = getSiteUrl() !== null && (await isGoogleEnabled());

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Sign in"
        description="Reading is open to everyone. Signing in is only needed to take part."
      />
      <Container>
        <div className="section section--tight auth-narrow stack stack--lg">
          <div className="panel stack">
            <h2 className="h-small">Continue with your college Google account</h2>
            <p className="muted">
              Only verified RNSIT Google accounts can join. Personal Gmail accounts are refused by
              the server.
            </p>
            <form action={signInWithGoogle}>
              <input type="hidden" name="next" value={next} />
              <button
                type="submit"
                className="btn btn--primary btn--block"
                disabled={!available}
                aria-describedby={available ? undefined : "signin-unavailable"}
              >
                Continue with Google
              </button>
            </form>
            {available ? null : (
              <p id="signin-unavailable" className="field__hint">
                Google sign-in is not configured in this environment yet.
              </p>
            )}
          </div>

          <Notice title="Registration is not open yet">
            <p>
              The official college email domain has not been confirmed, so new accounts cannot be
              created on the live site. Nothing is stored if a sign-in is refused.
            </p>
          </Notice>

          <section className="stack" aria-labelledby="what-we-keep">
            <h2 id="what-we-keep" className="h-small">
              What signing in shares
            </h2>
            <ul className="checklist">
              <li>
                Your name and college email from Google. Your name is shown on posts you do not mark
                anonymous.
              </li>
              <li>
                Your USN, department and batch, which you add once after signing in. Your USN is
                never shown to anyone.
              </li>
              <li>No Google password, contacts or other Google data.</li>
            </ul>
            <p className="field__hint">
              Details are in the <Link href="/privacy">privacy page</Link>.
            </p>
          </section>
        </div>
      </Container>
    </>
  );
}

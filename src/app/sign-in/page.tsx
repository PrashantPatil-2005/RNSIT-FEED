import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signInWithGoogle } from "@/app/auth/actions";
import { Container } from "@/components/layout/Container";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { site } from "@/config/site";
import { isGoogleEnabled } from "@/lib/auth/providers";
import { homeForRole } from "@/lib/auth/permissions";
import { postSignInPath, safeNextPath } from "@/lib/auth/redirect";
import { getViewer } from "@/lib/auth/session";
import { getSiteUrl } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const raw = (await searchParams).next;
  // Empty when no safe destination was asked for: the callback then uses the role's home page.
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw, "");
  const viewer = await getViewer();
  if (viewer)
    redirect(
      viewer.profile?.onboarded
        ? postSignInPath(next, homeForRole(viewer.profile.role))
        : "/onboarding",
    );

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
              Use your @{site.collegeDomain} Google account. Other accounts, including personal
              Gmail, are refused by the server unless an admin has invited you as an alumnus.
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

          {available ? (
            <Notice title="Graduated?">
              <p>
                If you no longer have a college account, an admin can invite the personal Google
                address you want to use. The invite works once and expires after 14 days. Nothing is
                stored if a sign-in is refused.
              </p>
            </Notice>
          ) : (
            <Notice title="Registration is not open yet">
              <p>
                New accounts cannot be created here yet. Nothing is stored if a sign-in is refused.
              </p>
            </Notice>
          )}

          {available ? (
            <p className="field__hint">
              Moderator or admin? There is no separate staff login. Sign in with the same college
              account: you go straight to your staff tools, which also appear under Staff in the
              header.
            </p>
          ) : null}

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

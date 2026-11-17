import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { ButtonLink } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";
import { authErrors, isAuthErrorCode } from "@/lib/auth/errors";

export const metadata: Metadata = { title: "Sign-in problem", robots: { index: false } };

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const raw = (await searchParams).code;
  const code = Array.isArray(raw) ? raw[0] : raw;
  // Only fixed, known messages are shown; anything else gets the generic one.
  const msg = isAuthErrorCode(code) ? authErrors[code] : authErrors.oauth_failed;
  return (
    <Container>
      <div className="section auth-narrow">
        <StateMessage
          kind="error"
          title={msg.title}
          action={
            <div className="cluster">
              <ButtonLink href="/sign-in" small>
                Back to sign-in
              </ButtonLink>
              <ButtonLink href="/experiences" variant="secondary" small>
                Browse experiences
              </ButtonLink>
            </div>
          }
        >
          <p>{msg.body}</p>
          <p className="field__hint">
            Read <Link href="/privacy">how sign-in data is handled</Link>.
          </p>
        </StateMessage>
      </div>
    </Container>
  );
}

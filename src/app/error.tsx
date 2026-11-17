"use client";

import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";

/**
 * Route-level error boundary. It deliberately shows no error message or stack trace: those can
 * leak internals. Only the opaque digest is shown so a problem can be matched to server logs.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Container>
      <div className="section">
        <StateMessage
          kind="error"
          title="Something went wrong"
          action={<Button onClick={reset}>Try again</Button>}
        >
          <p>This page could not be shown. You can try again, or come back a little later.</p>
          {error.digest ? <p className="state__ref">Reference: {error.digest}</p> : null}
        </StateMessage>
      </div>
    </Container>
  );
}

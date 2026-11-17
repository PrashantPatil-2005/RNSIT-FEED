"use client";

import { Button } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";
import "./globals.css";

/** Last-resort boundary: replaces the root layout, so it must render its own <html> and <body>. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="container" style={{ paddingBlock: "4rem" }}>
          <StateMessage
            kind="error"
            title="Something went seriously wrong"
            action={<Button onClick={reset}>Reload</Button>}
          >
            <p>The site hit an unexpected problem. Please try again.</p>
            {error.digest ? <p className="state__ref">Reference: {error.digest}</p> : null}
          </StateMessage>
        </main>
      </body>
    </html>
  );
}

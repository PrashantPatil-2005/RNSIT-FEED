import { Container } from "@/components/layout/Container";
import { StateMessage } from "./StateMessage";

/** Shown when the database connection is not configured (e.g. a fresh clone without .env.local). */
export function NotConfigured() {
  return (
    <Container>
      <div className="section">
        <StateMessage kind="error" title="Content is not available right now">
          <p>The site cannot reach its database. Please try again later.</p>
        </StateMessage>
      </div>
    </Container>
  );
}

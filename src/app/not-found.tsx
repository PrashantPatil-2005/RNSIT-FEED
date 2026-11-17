import { Container } from "@/components/layout/Container";
import { ButtonLink } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";

export default function NotFound() {
  return (
    <Container>
      <div className="section">
        <StateMessage
          title="Page not found"
          action={<ButtonLink href="/">Back to the home page</ButtonLink>}
        >
          <p>That page does not exist, or it has not been built yet.</p>
        </StateMessage>
      </div>
    </Container>
  );
}

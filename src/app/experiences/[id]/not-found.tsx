import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { StateMessage } from "@/components/ui/StateMessage";

export default function ExperienceNotFound() {
  return (
    <Container>
      <div className="section">
        <StateMessage title="This experience is not available">
          <p>
            It may never have existed, or it may have been withdrawn by its author or removed by a
            moderator.
          </p>
          <p>
            <Link href="/experiences">Browse all experiences</Link>
          </p>
        </StateMessage>
      </div>
    </Container>
  );
}

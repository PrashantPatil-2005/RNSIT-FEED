import Link from "next/link";
import { Container } from "@/components/layout/Container";

/** Honest, site-wide notice about what works today. Update as features ship. */
export function StatusBanner() {
  return (
    <div className="status-banner" role="note">
      <Container className="status-banner__inner">
        <strong>Early preview.</strong>
        <span>Reading is open to everyone. Sign-in and posting are not available yet.</span>
        <Link href="/disclaimer">Read the disclaimer</Link>
      </Container>
    </div>
  );
}

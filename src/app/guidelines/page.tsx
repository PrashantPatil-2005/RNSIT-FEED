import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Content guidelines" };

export default function GuidelinesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Trust"
        title="Content guidelines"
        description="How experiences should be written so they stay useful, fair and safe to share."
        badge={<Badge tone="accent">Draft · pending review by the project owner</Badge>}
      />
      <Container>
        <div className="section prose">
          <Notice title="Draft wording">
            <p>
              These rules come from the project&apos;s scope document. The final wording has not
              been approved yet and may change before launch.
            </p>
          </Notice>
          <section aria-labelledby="g-own-words">
            <h2 id="g-own-words">Describe questions in your own words</h2>
            <p>
              Say what was asked and how you approached it. Do not paste question papers, take
              screenshots of tests, or share any material covered by a company agreement.
            </p>
          </section>
          <section aria-labelledby="g-process">
            <h2 id="g-process">Describe the process, not the people</h2>
            <p>
              Write about rounds, topics and difficulty. Do not attack or name interviewers or
              employees.
            </p>
          </section>
          <section aria-labelledby="g-personal">
            <h2 id="g-personal">Keep personal details out</h2>
            <p>
              Posts are public. Leave out phone numbers, email addresses, social profiles, USNs and
              the names of individuals.
            </p>
          </section>
          <section aria-labelledby="g-pay">
            <h2 id="g-pay">No exact salary figures</h2>
            <p>Do not share exact salary or CTC numbers.</p>
          </section>
          <section aria-labelledby="g-review">
            <h2 id="g-review">Posts are reviewed</h2>
            <p>
              Moderators check posts before they are published and reject posts that break these
              rules.
            </p>
          </section>
        </div>
      </Container>
    </>
  );
}

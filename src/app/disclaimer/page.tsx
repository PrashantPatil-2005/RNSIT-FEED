import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Disclaimer" };

export default function DisclaimerPage() {
  return (
    <>
      <PageHeader
        eyebrow="Trust"
        title="Disclaimer"
        description="What this site is, and what it is not."
        badge={<Badge tone="accent">Draft · pending review by the project owner</Badge>}
      />
      <Container>
        <div className="section prose">
          <Notice title="Draft wording">
            <p>The final text has not been approved yet and may change before launch.</p>
          </Notice>
          <section aria-labelledby="d-unofficial">
            <h2 id="d-unofficial">Not an official RNSIT platform</h2>
            <p>
              RNSIT FEED is an independent student initiative. It is not run, endorsed or verified
              by RNS Institute of Technology and is not affiliated with the institute.
            </p>
          </section>
          <section aria-labelledby="d-placement">
            <h2 id="d-placement">Does not replace the placement cell</h2>
            <p>
              This site does not list jobs and does not replace announcements from the Training and
              Placement cell. Always rely on official notices for eligibility and dates.
            </p>
          </section>
          <section aria-labelledby="d-accuracy">
            <h2 id="d-accuracy">Experiences are personal accounts</h2>
            <p>
              Experiences are written by individual students. They may be incomplete, subjective or
              out of date, and hiring processes change. Use them to prepare, not as a guarantee of
              what a company will do.
            </p>
          </section>
        </div>
      </Container>
    </>
  );
}

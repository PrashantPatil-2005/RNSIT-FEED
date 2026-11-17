import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { PlannedFeature } from "@/components/ui/PlannedFeature";

export const metadata: Metadata = { title: "Share an experience" };

export default function SharePage() {
  return (
    <PlannedFeature
      eyebrow="Contribute"
      title="Share an experience"
      summary="A guided, round-by-round form for verified RNSIT students and alumni to pass on what they learned."
      noticeTitle="Posting opens with verified sign-in"
      notice="The form is not open yet, so experiences cannot be submitted and drafts are not saved for now. Reading stays open to everyone in the meantime."
      willDo={[
        "Walk through the company, role and each interview round, with the questions in your own words.",
        "Have your draft saved automatically, so you can finish later on any device.",
        "Choose whether to post under your name or anonymously.",
        "Send your experience to a moderator, who reviews it before it is published.",
      ]}
      actions={
        <>
          <ButtonLink href="/guidelines" variant="secondary" small>
            Read the content guidelines
          </ButtonLink>
          <ButtonLink href="/experiences" variant="secondary" small>
            Browse experiences
          </ButtonLink>
        </>
      }
    />
  );
}

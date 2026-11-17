import type { Metadata } from "next";
import { PlannedFeature } from "@/components/ui/PlannedFeature";

export const metadata: Metadata = { title: "Share an experience" };

export default function SharePage() {
  return (
    <PlannedFeature
      eyebrow="Contribute"
      title="Share an experience"
      summary="A guided form for verified RNSIT students and alumni. It is not available yet, and nothing you type anywhere on this site is saved."
      willDo={[
        "Guide you through the company, role and each interview round, with the questions in your own words.",
        "Save your draft as you write, so you can finish later.",
        "Let you choose whether to post under your name or anonymously.",
        "Send your post to a moderator for review before it is published.",
      ]}
    />
  );
}

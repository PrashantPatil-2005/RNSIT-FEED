import type { Metadata } from "next";
import { PlannedFeature } from "@/components/ui/PlannedFeature";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <PlannedFeature
      eyebrow="Trust"
      title="Privacy"
      summary="The privacy policy has not been written yet. This site currently collects no personal data."
      willDo={[
        "Explain what personal data is collected, why, and who can see it.",
        "Explain how to delete your account and what happens to your posts.",
        "Give a contact for privacy and grievance requests.",
      ]}
    />
  );
}

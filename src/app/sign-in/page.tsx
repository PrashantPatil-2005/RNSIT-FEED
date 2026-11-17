import type { Metadata } from "next";
import { PlannedFeature } from "@/components/ui/PlannedFeature";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <PlannedFeature
      eyebrow="Accounts"
      title="Sign in"
      summary="Sign-in does not exist yet. Please do not enter any personal details anywhere on this site."
      willDo={[
        "Let RNSIT students and alumni sign in with Google, limited to the official college email domain once it is confirmed.",
        "Be required only for taking part (posting and reporting), never for reading.",
        "Keep your USN private. It will never be shown to other users.",
      ]}
    />
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { PlannedFeature } from "@/components/ui/PlannedFeature";
import { getViewer } from "@/lib/auth/session";
import { emptyForm } from "@/lib/experience/draft";
import { EditorPage } from "./EditorPage";

export const metadata: Metadata = { title: "Share an experience", robots: { index: false } };

export default async function SharePage() {
  const viewer = await getViewer();
  if (viewer && !viewer.profile?.onboarded) redirect("/onboarding?next=/share");
  if (viewer?.profile && !viewer.profile.deletionRequested) {
    // A draft row is created only on the first autosave, so visiting this page stores nothing.
    return (
      <EditorPage
        viewer={viewer}
        draft={{
          id: null,
          version: null,
          form: emptyForm(),
          status: "draft",
          moderationNote: null,
        }}
      />
    );
  }
  return (
    <PlannedFeature
      eyebrow="Contribute"
      title="Share an experience"
      summary="A guided, round-by-round form for verified RNSIT students and alumni to pass on what they learned."
      noticeTitle="Sign in to share"
      notice="Sharing needs a verified RNSIT sign-in. Reading stays open to everyone."
      badge={<Badge tone="accent">Sign-in required</Badge>}
      listTitle="After you sign in, you can"
      willDo={[
        "Walk through the company, role and each interview round, with the questions in your own words.",
        "Have your draft saved automatically, so you can finish later on any device.",
        "Choose whether to post under your name or anonymously.",
        "Send your experience to a moderator, who reviews it before it is published.",
      ]}
      actions={
        <>
          <ButtonLink href="/sign-in?next=/share" small>
            Sign in to share
          </ButtonLink>
          <ButtonLink href="/guidelines" variant="secondary" small>
            Read the content guidelines
          </ButtonLink>
        </>
      }
    />
  );
}

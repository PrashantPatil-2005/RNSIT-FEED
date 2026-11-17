import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import { safeNextPath } from "@/lib/auth/redirect";
import { requireViewer } from "@/lib/auth/session";
import { getReferenceData } from "@/lib/data/queries";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = { title: "Finish setting up", robots: { index: false } };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const viewer = await requireViewer("/onboarding");
  if (viewer.profile?.onboarded) redirect("/account");
  if (!viewer.profile) return <NotConfigured />;
  const raw = (await searchParams).next;
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw);
  const ref = await getReferenceData(viewer.db);

  return (
    <>
      <PageHeader
        eyebrow="One-time setup"
        title="Finish setting up your account"
        description="Three details, asked once. They let readers filter experiences by department and batch."
      />
      <Container>
        <div className="section section--tight auth-narrow stack stack--lg">
          {viewer.profile.deletionRequested ? (
            <StateMessage kind="error" title="This account is being deleted">
              <p>Setup is not available for an account with a pending deletion request.</p>
            </StateMessage>
          ) : (
            <>
              <div className="panel stack--sm">
                <p className="field__hint">Name (from your Google account)</p>
                <p className="profile-name">{viewer.profile.fullName}</p>
                <p className="field__hint">
                  Your name comes from Google and is locked so nobody can impersonate another
                  student. If it is wrong, an admin can correct it.
                </p>
              </div>
              <OnboardingForm
                departments={ref.departments.map((d) => ({
                  id: d.id,
                  label: `${d.code} · ${d.name}`,
                }))}
                batches={ref.batches.map((b) => ({ id: b.id, label: String(b.year) }))}
                next={next}
              />
            </>
          )}
        </div>
      </Container>
    </>
  );
}

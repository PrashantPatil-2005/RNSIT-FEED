import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { Container } from "@/components/layout/Container";
import { ActionForm, ReasonField } from "@/components/ui/ActionForm";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleLabels } from "@/lib/admin/labels";
import { roleAbilities, staffLinksFor } from "@/lib/auth/permissions";
import { requireViewer } from "@/lib/auth/session";
import { getReferenceData } from "@/lib/data/queries";
import { stepDownAction } from "./actions";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

/** Shows the year and department part only; the serial is hidden unless the owner expands it. */
function maskUsn(usn: string): string {
  return `${usn.slice(0, 7)}•••`;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const steppedDown = (await searchParams).stepped_down === "1";
  const viewer = await requireViewer("/account");
  const profile = viewer.profile;
  if (!profile || !profile.onboarded) redirect("/onboarding");

  const isModerator = profile.role === "moderator";
  const [{ data: usn }, ref, { data: myDepts }] = await Promise.all([
    viewer.db.rpc("get_my_usn"),
    getReferenceData(viewer.db),
    isModerator ? viewer.db.rpc("my_moderator_departments") : Promise.resolve({ data: null }),
  ]);
  const dept = ref.departments.find((d) => d.id === profile.departmentId);
  const batch = ref.batches.find((b) => b.id === profile.batchId);
  const staffLinks = staffLinksFor(profile.role);

  return (
    <>
      <PageHeader eyebrow="Account" title="Your account" />
      <Container>
        <div className="section section--tight auth-narrow stack stack--lg">
          {steppedDown ? (
            <Notice title="You have stepped down">
              <p>
                You are no longer a moderator. Your role is now {roleLabels[profile.role]}. Thank
                you for moderating.
              </p>
            </Notice>
          ) : null}
          <div className="panel">
            <dl className="facts facts--account">
              <div>
                <dt>Name</dt>
                <dd>{profile.fullName}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd className="break">{viewer.user.email}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{dept ? `${dept.code} · ${dept.name}` : "–"}</dd>
              </div>
              <div>
                <dt>Graduation batch</dt>
                <dd>{batch?.year ?? "–"}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{roleLabels[profile.role]}</dd>
              </div>
              <div>
                <dt>USN (private)</dt>
                <dd>
                  {usn ? (
                    <details className="reveal">
                      <summary>
                        <span aria-hidden="true">{maskUsn(usn)}</span>
                        <span className="visually-hidden">Hidden.</span> Show
                      </summary>
                      <span className="mono">{usn}</span>
                    </details>
                  ) : (
                    "–"
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <section className="panel stack role-card" aria-labelledby="role-heading">
            <h2 id="role-heading" className="h-small">
              Your role:{" "}
              <span className={`status status--role-${profile.role}`}>
                {roleLabels[profile.role]}
              </span>
            </h2>
            <ul className="checklist">
              {roleAbilities[profile.role].map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            {isModerator ? (
              <p>
                <strong>Your departments:</strong>{" "}
                {myDepts && myDepts.length > 0
                  ? myDepts.map((d) => `${d.code} · ${d.name}`).join(", ")
                  : "none assigned yet (you see every department)"}
                . Your queue opens on these; you can still review any department.
              </p>
            ) : null}
            {staffLinks.length > 0 ? (
              <p className="role-card__links">
                {staffLinks.map((l, i) => (
                  <span key={l.href}>
                    {i > 0 ? " · " : null}
                    <Link href={l.href}>{l.label}</Link>
                  </span>
                ))}
              </p>
            ) : null}
          </section>

          {isModerator ? (
            <details className="panel admin-details step-down">
              <summary>Step down as moderator</summary>
              <p className="muted">
                You go back to your previous role, your departments are cleared, and the change is
                recorded. Only an admin can make you a moderator again.
              </p>
              <ActionForm
                action={stepDownAction}
                submitLabel="Step down"
                label="Step down as moderator"
                danger
              >
                <ReasonField
                  id="step-down-reason"
                  hint="Kept in the audit log, for example: exams this semester. No names or USNs."
                />
                <div className="check">
                  <input
                    id="step-down-confirm"
                    name="confirm"
                    type="checkbox"
                    value="yes"
                    required
                  />
                  <label htmlFor="step-down-confirm">I want to stop moderating</label>
                </div>
              </ActionForm>
            </details>
          ) : null}

          <ul className="checklist">
            <li>Only you can see your USN. Moderators and other students never can.</li>
            <li>
              Name, department, batch and USN are locked after setup to keep the archive reliable.
              An admin can correct a mistake.
            </li>
            <li>
              Your role is assigned by admins. Moderators can step down here; any other change goes
              through an admin. See the <Link href="/privacy">privacy page</Link>.
            </li>
          </ul>

          <p>
            <Link href="/my/experiences">My experiences</Link> · drafts, submissions and published
            posts.
          </p>

          <form action={signOut}>
            <button type="submit" className="btn btn--secondary">
              Sign out
            </button>
          </form>
        </div>
      </Container>
    </>
  );
}

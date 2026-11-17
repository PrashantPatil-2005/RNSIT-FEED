import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireViewer, type UserRole } from "@/lib/auth/session";
import { getReferenceData } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

const roleLabels: Record<UserRole, string> = {
  student: "Student",
  alumni: "Alumni",
  moderator: "Moderator",
  admin: "Admin",
};

/** Shows the year and department part only; the serial is hidden unless the owner expands it. */
function maskUsn(usn: string): string {
  return `${usn.slice(0, 7)}•••`;
}

export default async function AccountPage() {
  const viewer = await requireViewer("/account");
  const profile = viewer.profile;
  if (!profile || !profile.onboarded) redirect("/onboarding");

  const [{ data: usn }, ref] = await Promise.all([
    viewer.db.rpc("get_my_usn"),
    getReferenceData(viewer.db),
  ]);
  const dept = ref.departments.find((d) => d.id === profile.departmentId);
  const batch = ref.batches.find((b) => b.id === profile.batchId);

  return (
    <>
      <PageHeader eyebrow="Account" title="Your account" />
      <Container>
        <div className="section section--tight auth-narrow stack stack--lg">
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

          <ul className="checklist">
            <li>Only you can see your USN. Moderators and other students never can.</li>
            <li>
              Name, department, batch and USN are locked after setup to keep the archive reliable.
              An admin can correct a mistake.
            </li>
            <li>
              Your role is assigned by admins and cannot be changed from your account. See the{" "}
              <Link href="/privacy">privacy page</Link>.
            </li>
          </ul>

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

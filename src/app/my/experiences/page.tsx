import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cancelSubmissionAction, deleteDraftAction } from "@/app/share/actions";
import { Container } from "@/components/layout/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import { requireViewer } from "@/lib/auth/session";
import { getReferenceData } from "@/lib/data/queries";

export const metadata: Metadata = { title: "My experiences", robots: { index: false } };

const statusInfo: Record<string, { label: string; help: string }> = {
  draft: { label: "Draft", help: "Only you can see it. It saves automatically." },
  pending: { label: "Waiting for review", help: "A moderator will review it before it is public." },
  approved: { label: "Published", help: "Visible to everyone." },
  returned: { label: "Changes requested", help: "Edit it and submit again." },
  rejected: {
    label: "Not accepted",
    help: "A moderator decided not to publish it. It cannot be resubmitted.",
  },
  removed: { label: "Removed", help: "Removed by a moderator." },
  withdrawn: { label: "Withdrawn", help: "You took it down. It is no longer public." },
};

function fmt(ts: string | null): string {
  if (!ts) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(ts));
}

export default async function MyExperiencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireViewer("/my/experiences");
  if (!viewer.profile?.onboarded) redirect("/onboarding");
  const sp = await searchParams;
  const [{ data, error }, ref, removedComments] = await Promise.all([
    viewer.db
      .from("my_experiences")
      .select(
        "id, status, company_id, role_title, recruitment_year, is_anonymous, moderation_note, updated_at, submitted_at",
      )
      .order("updated_at", { ascending: false }),
    getReferenceData(viewer.db),
    // The member's own comments that a moderator removed (removal reasons stay staff-only).
    viewer.db
      .from("my_comments")
      .select("id, experience_id, body, removed_at")
      .eq("status", "removed")
      .order("removed_at", { ascending: false })
      .limit(20),
  ]);
  const company = (id: string | null) =>
    ref.companies.find((c) => c.id === id)?.name ?? "Company not chosen";
  const rows = data ?? [];

  return (
    <>
      <PageHeader eyebrow="Your posts" title="My experiences" />
      <Container>
        <div className="section section--tight stack stack--lg">
          {sp.submitted ? (
            <Notice title="Submitted for review">
              <p>Thank you. A moderator will review it before it appears publicly.</p>
            </Notice>
          ) : null}
          {sp.deleted ? (
            <Notice title="Draft deleted">
              <p>The draft and everything in it was deleted.</p>
            </Notice>
          ) : null}
          {sp.error || error ? (
            <StateMessage kind="error" title="That did not work">
              <p>Please try again.</p>
            </StateMessage>
          ) : null}

          <div className="cluster">
            <ButtonLink href="/share">Share a new experience</ButtonLink>
          </div>

          {rows.length === 0 ? (
            <StateMessage title="Nothing here yet">
              <p>Experiences you start, submit or publish will appear here.</p>
            </StateMessage>
          ) : (
            <ul className="my-list list-reset">
              {rows.map((r) => {
                const info = statusInfo[r.status ?? "draft"] ?? statusInfo.draft!;
                const editable = r.status === "draft" || r.status === "returned";
                const deletable = editable || r.status === "rejected";
                return (
                  <li key={r.id} className="my-item">
                    <div className="my-item__main">
                      <p className="my-item__title">
                        {r.role_title || "Untitled draft"}{" "}
                        <span className="muted">· {company(r.company_id)}</span>
                      </p>
                      <p className="my-item__meta">
                        <span className={`status status--${r.status}`}>{info.label}</span>
                        <span>{info.help}</span>
                        <span>
                          {r.is_anonymous === true
                            ? "Anonymous"
                            : r.is_anonymous === false
                              ? "Under your name"
                              : "Name choice not made"}
                        </span>
                        <span>Updated {fmt(r.updated_at)}</span>
                      </p>
                      {(r.status === "returned" || r.status === "rejected") && r.moderation_note ? (
                        <p className="my-item__note">Moderator note: {r.moderation_note}</p>
                      ) : null}
                    </div>
                    <div className="my-item__actions">
                      {editable ? (
                        <ButtonLink href={`/share/${r.id}`} variant="secondary" small>
                          {r.status === "returned" ? "Edit and resubmit" : "Continue"}
                        </ButtonLink>
                      ) : null}
                      {r.status === "approved" ? (
                        <Link href={`/experiences/${r.id}`}>View</Link>
                      ) : null}
                      {r.status === "pending" ? (
                        <details className="confirm">
                          <summary>Pull back to draft</summary>
                          <form action={cancelSubmissionAction}>
                            <input type="hidden" name="id" value={r.id ?? ""} />
                            <p className="field__hint">
                              It leaves the review queue so you can edit it.
                            </p>
                            <button type="submit" className="btn btn--secondary btn--small">
                              Yes, pull it back
                            </button>
                          </form>
                        </details>
                      ) : null}
                      {deletable ? (
                        <details className="confirm">
                          <summary>Delete</summary>
                          <form action={deleteDraftAction}>
                            <input type="hidden" name="id" value={r.id ?? ""} />
                            <p className="field__hint">This cannot be undone.</p>
                            <button type="submit" className="btn btn--danger btn--small">
                              {r.status === "draft" ? "Delete draft" : "Delete"}
                            </button>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {removedComments.data?.length ? (
            <section aria-labelledby="removed-comments" className="stack">
              <h2 id="removed-comments">Comments removed by moderators</h2>
              <p className="muted">
                These comments are no longer shown. See the{" "}
                <Link href="/guidelines">content guidelines</Link> for what is allowed.
              </p>
              <ul className="my-list list-reset">
                {removedComments.data.map((c) => (
                  <li key={c.id} className="my-item">
                    <div>
                      <p className="my-item__note prewrap">“{c.body}”</p>
                      <p className="my-item__meta">
                        <Link href={`/experiences/${c.experience_id}`}>On this experience</Link>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </Container>
    </>
  );
}

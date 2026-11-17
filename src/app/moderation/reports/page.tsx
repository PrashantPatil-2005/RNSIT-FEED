import type { Metadata } from "next";
import Link from "next/link";
import { OutcomeField, StaffReasonField } from "@/components/moderation/StaffFields";
import { Container } from "@/components/layout/Container";
import { ActionForm } from "@/components/ui/ActionForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import { requireStaff } from "@/lib/auth/staff";
import { reportReasonLabels, type ReportReason } from "@/lib/community/labels";
import { resolveCommentReportAction, resolveReportAction } from "../actions";

export const metadata: Metadata = { title: "Reports · Moderation", robots: { index: false } };

const statusLabels: Record<string, string> = {
  open: "Open",
  actioned: "Acted on",
  dismissed: "Dismissed",
  moot: "Closed (content gone)",
};

function when(ts: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(ts),
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireStaff("/moderation/reports");
  const sp = await searchParams;
  const closed = sp.show === "closed";
  const db = viewer.db;

  // Staff-only views; neither exposes who reported. Open reports oldest first, closed newest first.
  let postQuery = db
    .from("moderation_reports")
    .select("id, experience_id, reason, details, status, created_at");
  let commentQuery = db
    .from("moderation_comment_reports")
    .select("id, comment_id, experience_id, reason, details, status, created_at");
  postQuery = closed ? postQuery.neq("status", "open") : postQuery.eq("status", "open");
  commentQuery = closed ? commentQuery.neq("status", "open") : commentQuery.eq("status", "open");
  const [posts, comments] = await Promise.all([
    postQuery.order("created_at", { ascending: !closed }).limit(100),
    commentQuery.order("created_at", { ascending: !closed }).limit(100),
  ]);

  const expIds = [
    ...new Set([...(posts.data ?? []), ...(comments.data ?? [])].map((r) => r.experience_id)),
  ];
  const commentIds = [...new Set((comments.data ?? []).map((r) => r.comment_id))];
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [exps, bodies] = await Promise.all([
    db
      .from("moderation_experiences")
      .select("id, company_name, role_title, status")
      .in("id", expIds.length ? expIds : none),
    db
      .from("moderation_comments")
      .select("id, body, author_name, by_post_author, status")
      .in("id", commentIds.length ? commentIds : none),
  ]);
  const exp = (id: string) => exps.data?.find((e) => e.id === id);
  const comment = (id: string) => bodies.data?.find((c) => c.id === id);
  const title = (id: string) => {
    const e = exp(id);
    return e ? `${e.role_title ?? "Untitled"} · ${e.company_name}` : "Experience";
  };

  const failed = posts.error || comments.error;

  return (
    <>
      <PageHeader
        eyebrow="Staff"
        title="Reports"
        description="Reports from members about published experiences and comments. Reporters are never shown."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <nav aria-label="Moderation sections" className="queue-tabs">
            <Link href="/moderation" className="queue-tab">
              Experience queue
            </Link>
            <Link
              href="/moderation/reports"
              className="queue-tab"
              aria-current={closed ? undefined : "page"}
            >
              Open reports
            </Link>
            <Link
              href="/moderation/reports?show=closed"
              className="queue-tab"
              aria-current={closed ? "page" : undefined}
            >
              Closed
            </Link>
          </nav>

          {failed ? (
            <StateMessage kind="error" title="Reports could not be loaded">
              <p>Please reload the page.</p>
            </StateMessage>
          ) : null}

          <section aria-labelledby="post-reports" className="stack">
            <h2 id="post-reports">
              Experiences <span className="muted">({posts.data?.length ?? 0})</span>
            </h2>
            {(posts.data ?? []).length === 0 ? (
              <p className="muted">{closed ? "No closed reports." : "No open reports."}</p>
            ) : (
              <ul className="my-list list-reset" aria-label="Experience reports">
                {(posts.data ?? []).map((r) => (
                  <li key={r.id} className="my-item">
                    <div>
                      <p className="my-item__title">
                        <Link href={`/moderation/${r.experience_id}`}>
                          {title(r.experience_id)}
                        </Link>
                      </p>
                      <p className="my-item__meta">
                        <span className={`status status--report-${r.status}`}>
                          {statusLabels[r.status] ?? r.status}
                        </span>
                        <span>{reportReasonLabels[r.reason as ReportReason] ?? r.reason}</span>
                        <span>{when(r.created_at)}</span>
                        {exp(r.experience_id)?.status === "removed" ? (
                          <span>Post removed</span>
                        ) : null}
                      </p>
                      {r.details ? <p className="my-item__note prewrap">“{r.details}”</p> : null}
                    </div>
                    {r.status === "open" ? (
                      <details className="admin-details">
                        <summary>Resolve</summary>
                        <ActionForm
                          action={resolveReportAction}
                          submitLabel="Save outcome"
                          label="Resolve experience report"
                        >
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="experience" value={r.experience_id} />
                          <OutcomeField
                            name={`pr-${r.id}`}
                            removeLabel="Remove the post from public view"
                          />
                          <StaffReasonField id={`pr-reason-${r.id}`} />
                        </ActionForm>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="comment-reports" className="stack">
            <h2 id="comment-reports">
              Comments <span className="muted">({comments.data?.length ?? 0})</span>
            </h2>
            {(comments.data ?? []).length === 0 ? (
              <p className="muted">{closed ? "No closed reports." : "No open reports."}</p>
            ) : (
              <ul className="my-list list-reset" aria-label="Comment reports">
                {(comments.data ?? []).map((r) => {
                  const c = comment(r.comment_id);
                  return (
                    <li key={r.id} className="my-item">
                      <div>
                        <p className="my-item__title">
                          Comment on{" "}
                          <Link href={`/moderation/${r.experience_id}#comment-${r.comment_id}`}>
                            {title(r.experience_id)}
                          </Link>
                        </p>
                        <p className="my-item__meta">
                          <span className={`status status--report-${r.status}`}>
                            {statusLabels[r.status] ?? r.status}
                          </span>
                          <span>{reportReasonLabels[r.reason as ReportReason] ?? r.reason}</span>
                          <span>{when(r.created_at)}</span>
                          {c?.status === "removed" ? <span>Comment removed</span> : null}
                        </p>
                        {c ? (
                          <blockquote className="quoted prewrap">
                            {c.body}
                            <footer className="muted">
                              — {c.author_name ?? (c.by_post_author ? "Post author" : "Member")}
                            </footer>
                          </blockquote>
                        ) : (
                          <p className="muted">The comment was deleted by its author.</p>
                        )}
                        {r.details ? <p className="my-item__note prewrap">“{r.details}”</p> : null}
                      </div>
                      {r.status === "open" ? (
                        <details className="admin-details">
                          <summary>Resolve</summary>
                          <ActionForm
                            action={resolveCommentReportAction}
                            submitLabel="Save outcome"
                            label="Resolve comment report"
                          >
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="experience" value={r.experience_id} />
                            <OutcomeField name={`cr-${r.id}`} removeLabel="Remove the comment" />
                            <StaffReasonField id={`cr-reason-${r.id}`} />
                          </ActionForm>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </Container>
    </>
  );
}

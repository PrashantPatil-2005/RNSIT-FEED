import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { RoundsList, type RoundView } from "@/components/experience/RoundsList";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { requireStaff } from "@/lib/auth/staff";
import { isUuid } from "@/lib/data/filters";
import {
  campusLabels,
  opportunityLabels,
  resultLabels,
  type CampusType,
  type OpportunityType,
  type ResultType,
  type RoundType,
} from "@/lib/data/labels";
import { getReferenceData } from "@/lib/data/queries";
import {
  actionLabels,
  reasonLabels,
  type ModAction,
  type ReasonCode,
} from "@/lib/moderation/labels";
import { DecisionPanel } from "../DecisionPanel";
import { moderateCommentAction, removeOrRestorePostAction } from "../actions";
import { StaffReasonField } from "@/components/moderation/StaffFields";
import { ActionForm } from "@/components/ui/ActionForm";

export const metadata: Metadata = { title: "Review experience", robots: { index: false } };

interface ReviewJson {
  id: string;
  status: string;
  row_version: number;
  moderation_note: string | null;
  company_id: string;
  company_name: string | null;
  /** false: a new company typed by the author; it becomes public when this post is approved. */
  company_listed: boolean | null;
  role_title: string | null;
  opportunity_type: OpportunityType | null;
  campus_type: CampusType | null;
  department_id: number;
  batch_id: number;
  recruitment_year: number | null;
  min_cgpa: number | null;
  backlogs_allowed: number | null;
  result: ResultType | null;
  prep_tips: string | null;
  is_anonymous: boolean | null;
  eligible_department_ids: number[];
  resources: { url: string; label: string | null }[];
  rounds: {
    round_type: RoundType;
    duration_min: number | null;
    platform: string | null;
    difficulty: number | null;
    notes: string | null;
    topic_ids: number[];
    questions: { body: string }[];
  }[];
  author_name: string | null;
  is_own: boolean;
  submitted_at: string | null;
  decided_at: string | null;
}

const statusLabel: Record<string, string> = {
  pending: "Pending review",
  approved: "Approved (public)",
  returned: "Changes requested",
  rejected: "Rejected",
  removed: "Removed",
};

function stamp(ts: string | null): string {
  if (!ts) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(ts),
  );
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireStaff(`/moderation/${encodeURIComponent(id)}`);
  if (!isUuid(id)) notFound();

  const [detail, history, ref, comments] = await Promise.all([
    viewer.db.rpc("moderation_experience_detail", { p_id: id }),
    viewer.db
      .from("moderation_history")
      .select("id, action, actor_role, actor_name, reason_code, created_at")
      .eq("experience_id", id)
      .order("created_at", { ascending: true }),
    getReferenceData(viewer.db),
    // Same anonymous-author masking as the public page; includes removed comments.
    viewer.db
      .from("moderation_comments")
      .select("id, body, status, created_at, author_name, by_post_author, open_reports")
      .eq("experience_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (detail.error || !detail.data) notFound();
  const e = detail.data as unknown as ReviewJson;

  const company = e.company_name ?? "Unknown company";
  const dept = ref.departments.find((d) => d.id === e.department_id);
  const batch = ref.batches.find((b) => b.id === e.batch_id);
  const topicSlug = (tid: number) => ref.topics.find((t) => t.id === tid)?.slug ?? `#${tid}`;
  const rounds: RoundView[] = e.rounds.map((r, i) => ({
    id: `r${i}`,
    position: i + 1,
    roundType: r.round_type,
    durationMin: r.duration_min,
    platform: r.platform,
    difficulty: r.difficulty,
    notes: r.notes,
    topics: r.topic_ids.map(topicSlug),
    questions: r.questions.map((q, j) => ({ id: `r${i}q${j}`, body: q.body })),
  }));
  const eligible = e.eligible_department_ids
    .map((d) => ref.departments.find((x) => x.id === d)?.code)
    .filter(Boolean)
    .join(", ");

  return (
    <article>
      <header className="page-header">
        <Container>
          <div className="stack">
            <nav aria-label="Breadcrumb" className="breadcrumb">
              <Link href="/moderation">Moderation</Link>
            </nav>
            <h1>{e.role_title ?? "Untitled"}</h1>
            <p className="lead">
              {company} · {dept?.code ?? "?"} · Batch {batch?.year ?? "?"} · Recruited{" "}
              {e.recruitment_year ?? "?"}
            </p>
            <div className="cluster cluster--tight">
              <span className={`status status--${e.status}`}>
                {statusLabel[e.status] ?? e.status}
              </span>
              {e.opportunity_type ? <Badge>{opportunityLabels[e.opportunity_type]}</Badge> : null}
              {e.campus_type ? <Badge>{campusLabels[e.campus_type]}</Badge> : null}
              {e.result ? <Badge>Result: {resultLabels[e.result]}</Badge> : null}
              {e.company_listed === false ? <Badge>New company</Badge> : null}
            </div>
            {e.company_listed === false && e.status === "pending" ? (
              <p className="field__hint">
                &ldquo;{company}&rdquo; is a new company typed by the author. Approving lists it
                publicly. If it is misspelled or already listed under another name, return the post
                and ask the author to use the listed name.
              </p>
            ) : null}
            <p className="byline">
              {e.is_anonymous ? (
                <>
                  Author: <strong>anonymous</strong> (hidden from moderators)
                </>
              ) : (
                <>
                  Author: <strong>{e.author_name ?? "unknown"}</strong>
                </>
              )}
              {e.submitted_at ? <> · Submitted {stamp(e.submitted_at)}</> : null}
            </p>
          </div>
        </Container>
      </header>

      <Container>
        <div className="detail">
          <div className="detail__main stack stack--lg">
            <Notice title="Review checklist">
              <ul>
                <li>
                  Questions are in the author&apos;s own words, not copied papers or screenshots.
                </li>
                <li>
                  No personal details, contact details, or names of interviewers or employees.
                </li>
                <li>Describes the process; does not attack anyone.</li>
              </ul>
            </Notice>

            <section aria-labelledby="rounds-title" className="stack">
              <h2 id="rounds-title">Interview rounds ({rounds.length})</h2>
              <RoundsList rounds={rounds} />
            </section>

            <section aria-labelledby="extra-title" className="stack">
              <h2 id="extra-title">Eligibility, tips and links</h2>
              <dl className="facts facts--account panel">
                <div>
                  <dt>Minimum CGPA</dt>
                  <dd>{e.min_cgpa ?? "–"}</dd>
                </div>
                <div>
                  <dt>Backlogs allowed</dt>
                  <dd>{e.backlogs_allowed ?? "–"}</dd>
                </div>
                <div>
                  <dt>Branches</dt>
                  <dd>{eligible || "–"}</dd>
                </div>
              </dl>
              {e.prep_tips ? <p className="prewrap measure">{e.prep_tips}</p> : null}
              {e.resources.length ? (
                <ul className="list-reset stack--sm">
                  {e.resources.map((r) => (
                    <li key={r.url}>
                      {/* Shown as text for review: moderators should not have to visit unknown links. */}
                      <span className="mono break">{r.url}</span>
                      {r.label ? <span className="muted"> · {r.label}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            {comments.data?.length ? (
              <section aria-labelledby="mod-comments-title" className="stack">
                <h2 id="mod-comments-title">Comments ({comments.data.length})</h2>
                <ul className="comments list-reset">
                  {comments.data.map((c) => (
                    <li key={c.id} id={`comment-${c.id}`} className="comment">
                      <p className="comment__meta">
                        <strong>
                          {c.author_name ?? (c.by_post_author ? "Post author" : "Member")}
                        </strong>
                        {c.status === "removed" ? <Badge>Removed</Badge> : null}
                        {c.open_reports ? (
                          <Badge>
                            {c.open_reports} open report{c.open_reports === 1 ? "" : "s"}
                          </Badge>
                        ) : null}
                        <span>{stamp(c.created_at)}</span>
                      </p>
                      <p className="prewrap">{c.body}</p>
                      <details className="comment__action">
                        <summary>{c.status === "removed" ? "Restore" : "Remove"}</summary>
                        <ActionForm
                          action={moderateCommentAction}
                          submitLabel={
                            c.status === "removed" ? "Restore comment" : "Remove comment"
                          }
                          danger={c.status !== "removed"}
                          label={c.status === "removed" ? "Restore comment" : "Remove comment"}
                        >
                          <input type="hidden" name="comment" value={c.id} />
                          <input type="hidden" name="experience" value={e.id} />
                          <input
                            type="hidden"
                            name="action"
                            value={c.status === "removed" ? "restore" : "remove"}
                          />
                          {c.status === "removed" ? null : (
                            <StaffReasonField id={`cm-reason-${c.id}`} required />
                          )}
                        </ActionForm>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="detail__aside" aria-label="Moderation">
            {e.is_own ? (
              <Notice title="This is your own post">
                <p>Another moderator has to review it.</p>
              </Notice>
            ) : e.status === "pending" ? (
              <DecisionPanel id={e.id} version={e.row_version} />
            ) : (
              <div className="panel">
                <h2 className="panel__title">Decided</h2>
                <p>
                  {statusLabel[e.status] ?? e.status}
                  {e.decided_at ? ` · ${stamp(e.decided_at)}` : ""}
                </p>
                {e.moderation_note ? <p className="prewrap">Note: {e.moderation_note}</p> : null}
                {e.status === "approved" ? (
                  <p>
                    <Link href={`/experiences/${e.id}`}>View public page</Link>
                  </p>
                ) : null}
              </div>
            )}

            {!e.is_own && (e.status === "approved" || e.status === "removed") ? (
              <div className="panel">
                <h2 className="panel__title">
                  {e.status === "approved" ? "Take down" : "Put back"}
                </h2>
                <ActionForm
                  action={removeOrRestorePostAction}
                  submitLabel={e.status === "approved" ? "Remove from public view" : "Restore"}
                  danger={e.status === "approved"}
                  label={e.status === "approved" ? "Remove from public view" : "Restore post"}
                >
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="version" value={e.row_version} />
                  <input
                    type="hidden"
                    name="action"
                    value={e.status === "approved" ? "remove" : "restore"}
                  />
                  {e.status === "approved" ? (
                    <>
                      <p>Hides it from everyone. It can be restored later.</p>
                      <StaffReasonField id="remove-reason" required />
                      <div className="field">
                        <label htmlFor="remove-note">Note to the author (optional)</label>
                        <textarea id="remove-note" name="note" rows={3} maxLength={1000} />
                      </div>
                    </>
                  ) : (
                    <p>Makes it public again.</p>
                  )}
                </ActionForm>
              </div>
            ) : null}

            <div className="panel">
              <h2 className="panel__title">History</h2>
              {history.data?.length ? (
                <ol className="history list-reset">
                  {history.data.map((h) => (
                    <li key={h.id}>
                      <span className="history__what">
                        {actionLabels[h.action as ModAction] ?? h.action}
                        {h.reason_code ? ` · ${reasonLabels[h.reason_code as ReasonCode]}` : ""}
                      </span>
                      <span className="history__who">
                        {h.actor_role === "author" ? "Author" : (h.actor_name ?? h.actor_role)} ·{" "}
                        {stamp(h.created_at)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">No history.</p>
              )}
            </div>
          </aside>
        </div>
      </Container>
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Container } from "@/components/layout/Container";
import { ResultBadge } from "@/components/experience/ResultBadge";
import { RoundsList } from "@/components/experience/RoundsList";
import { Badge } from "@/components/ui/Badge";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { SampleBadge, SampleNotice } from "@/components/ui/Sample";
import { isUuid } from "@/lib/data/filters";
import { campusLabels, formatDate, opportunityLabels, resultLabels } from "@/lib/data/labels";
import { getExperience } from "@/lib/data/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HelpfulButton } from "@/components/community/HelpfulButton";
import { ReportFields } from "@/components/community/ReportFields";
import { ActionForm } from "@/components/ui/ActionForm";
import { getViewer } from "@/lib/auth/session";
import { COMMENT_MAX, COMMENT_MIN } from "@/lib/community/labels";
import {
  addCommentAction,
  deleteCommentAction,
  reportCommentAction,
  reportExperienceAction,
} from "./actions";

type Participation =
  | { kind: "visitor" }
  | { kind: "setup" }
  | { kind: "none" }
  | {
      kind: "member";
      isAuthor: boolean;
      voted: boolean;
      reportedPost: boolean;
      reportedComments: Set<string>;
    };

/** What the viewer may do here. Display only: the database enforces every rule again. */
async function participation(id: string): Promise<Participation> {
  const viewer = await getViewer();
  if (!viewer) return { kind: "visitor" };
  const p = viewer.profile;
  if (!p || p.deletionRequested) return { kind: "none" };
  if (!p.onboarded) return { kind: "setup" };
  const [own, vote, report, commentReports] = await Promise.all([
    viewer.db.from("my_experiences").select("id").eq("id", id).maybeSingle(),
    viewer.db.from("my_votes").select("experience_id").eq("experience_id", id).maybeSingle(),
    viewer.db.from("my_reports").select("id").eq("experience_id", id).maybeSingle(),
    viewer.db.from("my_comment_reports").select("comment_id"),
  ]);
  return {
    kind: "member",
    isAuthor: !!own.data,
    voted: !!vote.data,
    reportedPost: !!report.data,
    reportedComments: new Set((commentReports.data ?? []).map((r) => r.comment_id)),
  };
}

type Props = { params: Promise<{ id: string }> };

// One fetch per request, shared by generateMetadata and the page.
const load = cache(async (id: string) => {
  const db = await createSupabaseServerClient();
  if (!db) return { configured: false as const };
  if (!isUuid(id)) return { configured: true as const, exp: null };
  return { configured: true as const, exp: await getExperience(db, id) };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load((await params).id);
  if (!r.configured || !r.exp) return { title: "Experience" };
  return {
    title: `${r.exp.companyName} · ${r.exp.roleTitle}`,
    description: `${opportunityLabels[r.exp.opportunityType]} placement experience at ${r.exp.companyName}: ${r.exp.rounds.length} round(s), result ${resultLabels[r.exp.result].toLowerCase()}.`,
  };
}

export default async function ExperienceDetailPage({ params }: Props) {
  const r = await load((await params).id);
  if (!r.configured) return <NotConfigured />;
  const exp = r.exp;
  if (!exp) notFound();
  const who = await participation(exp.id);
  const signInHref = `/sign-in?next=${encodeURIComponent(`/experiences/${exp.id}`)}`;
  const joinPrompt =
    who.kind === "visitor" ? (
      <p className="signin-note">
        <Link href={signInHref}>Sign in with your RNSIT Google account</Link> to vote, comment or
        report.
      </p>
    ) : who.kind === "setup" ? (
      <p className="signin-note">
        <Link href="/onboarding">Finish setting up your account</Link> to vote, comment or report.
      </p>
    ) : null;

  const eligibility = [
    exp.minCgpa !== null ? `Minimum CGPA ${exp.minCgpa}` : null,
    exp.backlogsAllowed !== null
      ? exp.backlogsAllowed === 0
        ? "No backlogs allowed"
        : `Up to ${exp.backlogsAllowed} backlog${exp.backlogsAllowed === 1 ? "" : "s"} allowed`
      : null,
    exp.eligibleDepartments.length ? `Branches: ${exp.eligibleDepartments.join(", ")}` : null,
  ].filter((x): x is string => x !== null);

  const rated = exp.rounds.map((x) => x.difficulty).filter((d): d is number => d !== null);
  const avgDifficulty = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
  const totalMinutes = exp.rounds.reduce((sum, x) => sum + (x.durationMin ?? 0), 0);

  return (
    <article>
      <header className="page-header">
        <Container>
          <div className="stack">
            <nav aria-label="Breadcrumb" className="breadcrumb">
              <Link href="/experiences">Experiences</Link>
              <span aria-hidden="true">/</span>
              <Link href={`/companies/${exp.companySlug}`}>{exp.companyName}</Link>
            </nav>
            <h1>{exp.roleTitle}</h1>
            <p className="lead">
              <Link href={`/companies/${exp.companySlug}`}>{exp.companyName}</Link> ·{" "}
              {exp.departmentCode} · Batch {exp.batchYear} · Recruited {exp.recruitmentYear}
            </p>
            <div className="cluster cluster--tight">
              <ResultBadge result={exp.result} />
              <span className="visually-hidden">Result: {resultLabels[exp.result]}.</span>
              <Badge>{opportunityLabels[exp.opportunityType]}</Badge>
              <Badge>{campusLabels[exp.campusType]}</Badge>
              <SampleBadge />
            </div>
            <p className="byline">
              Shared by <strong>{exp.authorName ?? "an anonymous member"}</strong>
              {exp.publishedOn ? (
                <>
                  {" "}
                  · Published <time dateTime={exp.publishedOn}>{formatDate(exp.publishedOn)}</time>
                </>
              ) : null}
            </p>
          </div>
        </Container>
      </header>

      <Container>
        <div className="detail">
          <div className="detail__main stack stack--lg">
            <SampleNotice>
              This is a synthetic sample experience created for testing the site. The company,
              rounds and questions are not real.
            </SampleNotice>

            <section aria-labelledby="rounds-title" className="stack">
              <h2 id="rounds-title">Interview rounds ({exp.rounds.length})</h2>
              <RoundsList rounds={exp.rounds} />
            </section>

            {exp.prepTips ? (
              <section aria-labelledby="tips-title" className="stack">
                <h2 id="tips-title">Preparation tips</h2>
                <p className="prewrap measure">{exp.prepTips}</p>
              </section>
            ) : null}

            <section aria-labelledby="comments-title" className="stack">
              <h2 id="comments-title">Comments ({exp.comments.length})</h2>
              {exp.comments.length ? (
                <ul className="comments list-reset">
                  {exp.comments.map((c) => (
                    <li key={c.id} className="comment" id={`comment-${c.id}`}>
                      <p className="comment__meta">
                        <strong>{c.authorName ?? "Post author"}</strong>
                        {c.byPostAuthor && c.authorName ? <Badge>Author</Badge> : null}
                        {c.isMine ? <Badge>You</Badge> : null}
                        {c.postedOn ? (
                          <time dateTime={c.postedOn}>{formatDate(c.postedOn)}</time>
                        ) : null}
                      </p>
                      <p className="prewrap">{c.body}</p>
                      {who.kind === "member" ? (
                        c.isMine ? (
                          <details className="comment__action">
                            <summary>Delete</summary>
                            <ActionForm
                              action={deleteCommentAction}
                              submitLabel="Delete my comment"
                              danger
                              label="Delete my comment"
                            >
                              <input type="hidden" name="id" value={exp.id} />
                              <input type="hidden" name="comment" value={c.id} />
                              <p className="field__hint">This cannot be undone.</p>
                            </ActionForm>
                          </details>
                        ) : who.reportedComments.has(c.id) ? (
                          <p className="field__hint">You reported this comment.</p>
                        ) : (
                          <details className="comment__action">
                            <summary>Report</summary>
                            <ActionForm
                              action={reportCommentAction}
                              submitLabel="Send report"
                              label="Report comment"
                            >
                              <input type="hidden" name="id" value={exp.id} />
                              <input type="hidden" name="comment" value={c.id} />
                              <ReportFields idPrefix={`rc-${c.id}`} />
                            </ActionForm>
                          </details>
                        )
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No comments yet.</p>
              )}
              {who.kind === "member" ? (
                <ActionForm
                  action={addCommentAction}
                  submitLabel="Post comment"
                  label="Add a comment"
                  className="comment-form"
                >
                  <input type="hidden" name="id" value={exp.id} />
                  <div className="field">
                    <label htmlFor="comment-body">Add a comment</label>
                    <textarea
                      id="comment-body"
                      name="body"
                      rows={3}
                      required
                      minLength={COMMENT_MIN}
                      maxLength={COMMENT_MAX}
                      aria-describedby="comment-hint"
                    />
                    <p id="comment-hint" className="field__hint">
                      {exp.authorName === null && who.isAuthor
                        ? "Your comment will show as “Post author”, without your name."
                        : "Shown with your name. Be kind; no personal or contact details."}
                    </p>
                  </div>
                </ActionForm>
              ) : (
                joinPrompt
              )}
            </section>
          </div>

          <aside className="detail__aside" aria-label="Summary">
            <div className="panel">
              <h2 className="panel__title">At a glance</h2>
              <dl className="facts">
                <div>
                  <dt>Result</dt>
                  <dd>{resultLabels[exp.result]}</dd>
                </div>
                <div>
                  <dt>Rounds</dt>
                  <dd>{exp.rounds.length}</dd>
                </div>
                <div>
                  <dt>Average difficulty</dt>
                  <dd>
                    {avgDifficulty !== null ? `${avgDifficulty.toFixed(1)} / 5` : "Not rated"}
                  </dd>
                </div>
                {totalMinutes > 0 ? (
                  <div>
                    <dt>Total interview time</dt>
                    <dd>{totalMinutes} min</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <div className="panel">
              <h2 className="panel__title">Helpful?</h2>
              {who.kind === "member" && !who.isAuthor ? (
                <HelpfulButton id={exp.id} count={exp.helpfulCount} voted={who.voted} />
              ) : (
                <>
                  <p className="helpful-count">
                    {exp.helpfulCount === 0
                      ? "No helpful votes yet."
                      : `${exp.helpfulCount} member${exp.helpfulCount === 1 ? "" : "s"} found this helpful.`}
                  </p>
                  {who.kind === "member" ? (
                    <p className="field__hint">
                      This is your experience, so you cannot vote on it.
                    </p>
                  ) : (
                    joinPrompt
                  )}
                </>
              )}
            </div>

            {who.kind === "member" && !who.isAuthor ? (
              <div className="panel">
                <h2 className="panel__title">Something wrong?</h2>
                {who.reportedPost ? (
                  <p>You reported this experience. Moderators will review it.</p>
                ) : (
                  <details className="comment__action">
                    <summary>Report this experience</summary>
                    <ActionForm
                      action={reportExperienceAction}
                      submitLabel="Send report"
                      label="Report this experience"
                    >
                      <input type="hidden" name="id" value={exp.id} />
                      <ReportFields idPrefix="rp" />
                    </ActionForm>
                  </details>
                )}
              </div>
            ) : null}

            <div className="panel">
              <h2 className="panel__title">Eligibility</h2>
              {eligibility.length ? (
                <ul className="list-reset stack--sm">
                  {eligibility.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Not shared.</p>
              )}
            </div>

            {exp.resources.length ? (
              <div className="panel">
                <h2 className="panel__title">Resources</h2>
                <ul className="list-reset stack--sm">
                  {exp.resources.map((res) => (
                    <li key={res.url}>
                      <a
                        className="resource-link"
                        href={res.url}
                        rel="nofollow noopener noreferrer ugc"
                        target="_blank"
                      >
                        {res.label ?? new URL(res.url).hostname}
                        <span className="visually-hidden"> (opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="field__hint">
                  External links are shared by the author and are not checked.
                </p>
              </div>
            ) : null}

            <p className="field__hint">
              Questions are written in the author’s own words. Question papers and confidential
              material are not allowed (<Link href="/guidelines">guidelines</Link>).
            </p>
          </aside>
        </div>
      </Container>
    </article>
  );
}

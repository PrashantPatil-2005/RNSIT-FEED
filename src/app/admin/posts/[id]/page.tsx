import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/layout/Container";
import { ActionForm, ReasonField } from "@/components/ui/ActionForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAdmin } from "@/lib/auth/staff";
import { isUuid } from "@/lib/data/filters";
import { deletePostAction, editPostAction } from "../../actions";

export const metadata: Metadata = { title: "Fix a post · Admin", robots: { index: false } };

interface PostJson {
  id: string;
  status: string;
  role_title: string | null;
  prep_tips: string | null;
  company_name: string | null;
  rounds: {
    id: string;
    position: number;
    round_type: string;
    notes: string | null;
    platform: string | null;
    questions: { id: string; body: string }[];
  }[];
  resources: { id: string; url: string; label: string | null }[];
}

const REASON_HINT =
  'Say what was wrong, for example "interviewer name removed". Kept in the audit log; the old text is not.';

/** One field fix: hidden post/field/target plus the new value and a reason. */
function FixForm({
  post,
  field,
  target,
  label,
  value,
  multiline,
  maxLength,
  id,
}: {
  post: string;
  field: string;
  target?: string;
  label: string;
  value: string;
  multiline?: boolean;
  maxLength: number;
  id: string;
}) {
  return (
    <ActionForm action={editPostAction} submitLabel="Save fix" label={label}>
      <input type="hidden" name="post" value={post} />
      <input type="hidden" name="field" value={field} />
      {target ? <input type="hidden" name="target" value={target} /> : null}
      <div className="field">
        <label htmlFor={`${id}-value`}>{label}</label>
        {multiline ? (
          <textarea
            id={`${id}-value`}
            name="value"
            rows={5}
            maxLength={maxLength}
            defaultValue={value}
          />
        ) : (
          <input
            id={`${id}-value`}
            name="value"
            type="text"
            maxLength={maxLength}
            defaultValue={value}
          />
        )}
      </div>
      <ReasonField id={`${id}-reason`} hint={REASON_HINT} />
    </ActionForm>
  );
}

export default async function AdminPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireAdmin(`/admin/posts/${encodeURIComponent(id)}`);
  if (!isUuid(id)) notFound();
  const { data, error } = await viewer.db.rpc("admin_post_detail", { p_experience: id });
  if (error || !data) notFound();
  const e = data as unknown as PostJson;

  return (
    <>
      <PageHeader
        eyebrow="Admin · Posts"
        title={`${e.company_name ?? "Unknown company"} · ${e.role_title ?? "Untitled"}`}
        description="Fix text without changing anything else. The post keeps its status and author. Each fix is recorded in the audit log."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <AdminNav current="/admin/posts" />
          <p className="cluster cluster--tight">
            <span className={`status status--${e.status}`}>{e.status}</span>
            {e.status === "approved" ? (
              <Link href={`/experiences/${e.id}`}>View public page</Link>
            ) : null}
            <Link href={`/moderation/${e.id}`}>Open in moderation</Link>
          </p>

          <section aria-labelledby="fix-main" className="panel stack">
            <h2 id="fix-main" className="panel__title">
              Title and tips
            </h2>
            <details className="admin-details">
              <summary>Fix role title</summary>
              <FixForm
                post={e.id}
                field="role_title"
                label="Role title"
                value={e.role_title ?? ""}
                maxLength={120}
                id="title"
              />
            </details>
            <details className="admin-details">
              <summary>Fix preparation tips</summary>
              <FixForm
                post={e.id}
                field="prep_tips"
                label="Preparation tips"
                value={e.prep_tips ?? ""}
                multiline
                maxLength={5000}
                id="tips"
              />
            </details>
          </section>

          {e.rounds.map((r) => (
            <section key={r.id} aria-labelledby={`round-${r.id}`} className="panel stack">
              <h2 id={`round-${r.id}`} className="panel__title">
                Round {r.position} · {r.round_type}
              </h2>
              <details className="admin-details">
                <summary>Fix notes</summary>
                <FixForm
                  post={e.id}
                  field="round_notes"
                  target={r.id}
                  label={`Round ${r.position} notes`}
                  value={r.notes ?? ""}
                  multiline
                  maxLength={2000}
                  id={`notes-${r.id}`}
                />
              </details>
              <details className="admin-details">
                <summary>Fix platform</summary>
                <FixForm
                  post={e.id}
                  field="round_platform"
                  target={r.id}
                  label={`Round ${r.position} platform`}
                  value={r.platform ?? ""}
                  maxLength={120}
                  id={`platform-${r.id}`}
                />
              </details>
              {r.questions.map((q, i) => (
                <details key={q.id} className="admin-details">
                  <summary>
                    Fix question {i + 1}: {q.body.length > 60 ? `${q.body.slice(0, 60)}…` : q.body}
                  </summary>
                  <FixForm
                    post={e.id}
                    field="question"
                    target={q.id}
                    label={`Round ${r.position}, question ${i + 1}`}
                    value={q.body}
                    multiline
                    maxLength={2000}
                    id={`q-${q.id}`}
                  />
                </details>
              ))}
            </section>
          ))}

          {e.resources.length ? (
            <section aria-labelledby="fix-links" className="panel stack">
              <h2 id="fix-links" className="panel__title">
                Links
              </h2>
              {e.resources.map((x) => (
                <details key={x.id} className="admin-details">
                  <summary>Remove {x.label || x.url}</summary>
                  <ActionForm
                    action={editPostAction}
                    submitLabel="Remove link"
                    label={`Remove link ${x.url}`}
                    danger
                  >
                    <input type="hidden" name="post" value={e.id} />
                    <input type="hidden" name="field" value="remove_resource" />
                    <input type="hidden" name="target" value={x.id} />
                    <p className="muted">{x.url}</p>
                    <ReasonField id={`res-${x.id}-reason`} hint={REASON_HINT} />
                  </ActionForm>
                </details>
              ))}
            </section>
          ) : null}

          <section aria-labelledby="delete-post" className="panel stack">
            <h2 id="delete-post" className="panel__title">
              Delete permanently
            </h2>
            <p>
              To hide a published post, use Remove in the moderation queue; it can be restored.
              Deleting erases the post with its comments, votes and reports and cannot be undone.
            </p>
            <details className="admin-details">
              <summary>Delete this post</summary>
              <ActionForm
                action={deletePostAction}
                submitLabel="Delete permanently"
                label="Delete this post"
                danger
              >
                <input type="hidden" name="post" value={e.id} />
                <div className="field">
                  <label htmlFor="delete-confirm">Type DELETE to confirm</label>
                  <input
                    id="delete-confirm"
                    name="confirm_text"
                    type="text"
                    required
                    autoComplete="off"
                  />
                </div>
                <ReasonField id="delete-reason" />
              </ActionForm>
            </details>
          </section>
        </div>
      </Container>
    </>
  );
}

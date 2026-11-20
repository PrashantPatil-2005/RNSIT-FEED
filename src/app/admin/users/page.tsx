import type { Metadata } from "next";
import { ActionForm, ReasonField } from "@/components/ui/ActionForm";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import Link from "next/link";
import { isRole, ROLES, roleLabels, rolePlurals } from "@/lib/admin/labels";
import { requireAdmin } from "@/lib/auth/staff";
import { getReferenceData } from "@/lib/data/queries";
import { REASON_CODES, reasonLabels } from "@/lib/moderation/labels";
import {
  correctNameAction,
  forceDeleteUserAction,
  removeUserCommentsAction,
  setRoleAction,
  setSuspendedAction,
  setUserDetailsAction,
  viewUsnAction,
} from "../actions";

export const metadata: Metadata = { title: "Users and roles · Admin", robots: { index: false } };

const LIMIT = 50;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireAdmin("/admin/users");
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 80);
  const roleRaw = first(sp.role);
  const role = isRole(roleRaw) ? roleRaw : null;
  const historyRaw = first(sp.history);
  const historyFor = /^[0-9a-f-]{36}$/i.test(historyRaw) ? historyRaw : null;
  const keep = (extra: Record<string, string>) => {
    const qs = new URLSearchParams({ ...(q ? { q } : {}), ...(role ? { role } : {}), ...extra });
    const str = qs.toString();
    return str ? `/admin/users?${str}` : "/admin/users";
  };

  // Admin-only read (RLS profiles_read_admin). No email or USN is selected or shown here.
  let query = viewer.db
    .from("profiles")
    .select(
      "id, full_name, role, department_id, batch_id, onboarded_at, created_at, deletion_requested_at, suspended_at",
    )
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (q) query = query.ilike("full_name", `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  if (role) query = query.eq("role", role);
  const [{ data: people, error }, ref, history, owner] = await Promise.all([
    query,
    getReferenceData(viewer.db),
    historyFor
      ? viewer.db.rpc("admin_user_role_history", { p_user: historyFor })
      : Promise.resolve(null),
    viewer.db.rpc("admin_owner_id"),
  ]);
  // Owner rules (migration 024): the owner's role is fixed and only the owner manages admins.
  // Display only; the database enforces both.
  const ownerId = owner.data ?? null;
  const viewerIsOwner = ownerId !== null && ownerId === viewer.user.id;
  const canManageAdmins = ownerId === null || viewerIsOwner;
  const historyName = historyFor ? people?.find((x) => x.id === historyFor)?.full_name : undefined;

  const dept = (id: number | null) => ref.departments.find((d) => d.id === id)?.code ?? "—";
  const batch = (id: number | null) => ref.batches.find((b) => b.id === id)?.year ?? "—";
  const joined = (ts: string) =>
    new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(ts),
    );

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Users and roles"
        description="Appoint moderators and admins, mark alumni and correct names. Each change needs a reason and is audited."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <AdminNav current="/admin/users" />

          <form method="get" className="admin-search" role="search" aria-label="Find users">
            <div className="field">
              <label htmlFor="q">Name</label>
              <input id="q" name="q" type="search" defaultValue={q} maxLength={80} />
            </div>
            <div className="field">
              <label htmlFor="role">Role</label>
              <select id="role" name="role" defaultValue={role ?? ""}>
                <option value="">Any role</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {rolePlurals[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button type="submit" className="btn btn--secondary btn--small">
                Search
              </button>
            </div>
          </form>

          {historyFor ? (
            <section className="panel stack" aria-labelledby="history-title">
              <h2 id="history-title" className="panel__title">
                Role history{historyName ? ` · ${historyName}` : ""}
              </h2>
              {history?.error ? (
                <p>The history could not be loaded.</p>
              ) : !history?.data || history.data.length === 0 ? (
                <p className="muted">
                  No recorded role changes. History is kept from migration 019 onward.
                </p>
              ) : (
                <ol className="role-history list-reset">
                  {history.data.map((h, i) => (
                    <li key={`${h.created_at}-${i}`}>
                      <strong>
                        {roleLabels[h.old_role]} → {roleLabels[h.new_role]}
                      </strong>{" "}
                      <span className="muted">
                        ·{" "}
                        {h.self_service
                          ? "stepped down themselves"
                          : `by ${h.changed_by_name ?? "a deleted account"}`}{" "}
                        ·{" "}
                        {new Intl.DateTimeFormat("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(h.created_at))}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="muted">
                Reasons are in the <Link href="/admin/audit">audit log</Link>.{" "}
                <Link href={keep({})}>Close</Link>
              </p>
            </section>
          ) : null}

          {error ? (
            <StateMessage kind="error" title="Users could not be loaded">
              <p>Please reload the page.</p>
            </StateMessage>
          ) : !people || people.length === 0 ? (
            <StateMessage title="No matching users">
              <p>Try another name or role.</p>
            </StateMessage>
          ) : (
            <>
              <p className="muted">
                {people.length === LIMIT
                  ? `Showing the newest ${LIMIT}. Search by name to narrow the list.`
                  : `${people.length} ${people.length === 1 ? "user" : "users"}.`}
              </p>
              <ul className="my-list list-reset" aria-label="Users">
                {people.map((p) => {
                  const self = p.id === viewer.user.id;
                  const isOwner = p.id === ownerId;
                  const roleLocked = isOwner || (p.role === "admin" && !canManageAdmins);
                  const roleChoices = canManageAdmins ? ROLES : ROLES.filter((r) => r !== "admin");
                  return (
                    <li key={p.id} className="my-item admin-user">
                      <div>
                        <p className="my-item__title">
                          {p.full_name} {self ? <span className="muted">(you)</span> : null}
                          {isOwner ? <span className="status status--owner">Owner</span> : null}
                        </p>
                        <p className="my-item__meta">
                          <span className={`status status--role-${p.role}`}>
                            {roleLabels[p.role]}
                          </span>
                          <span>
                            {dept(p.department_id)} · Batch {batch(p.batch_id)}
                          </span>
                          <span>Joined {joined(p.created_at)}</span>
                          <Link href={keep({ history: p.id })}>Role history</Link>
                          {p.onboarded_at ? null : <span>Setup not finished</span>}
                          {p.deletion_requested_at ? <span>Deletion requested</span> : null}
                          {p.suspended_at ? (
                            <span className="status status--rejected">Suspended</span>
                          ) : null}
                        </p>
                      </div>
                      {self || p.deletion_requested_at ? null : (
                        <div className="admin-user__actions">
                          {roleLocked ? (
                            <p className="muted">
                              {isOwner
                                ? "The owner's role cannot be changed."
                                : "Only the owner can change an admin's role."}
                            </p>
                          ) : (
                            <details className="admin-details">
                              <summary>Change role</summary>
                              <ActionForm
                                action={setRoleAction}
                                submitLabel="Change role"
                                label={`Change role for ${p.full_name}`}
                              >
                                <input type="hidden" name="user" value={p.id} />
                                <div className="field">
                                  <label htmlFor={`role-${p.id}`}>New role</label>
                                  <select id={`role-${p.id}`} name="role" defaultValue={p.role}>
                                    {roleChoices.map((r) => (
                                      <option key={r} value={r}>
                                        {roleLabels[r]}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                {canManageAdmins ? (
                                  <div className="check">
                                    <input
                                      id={`confirm-admin-${p.id}`}
                                      name="confirm_admin"
                                      type="checkbox"
                                      value="yes"
                                    />
                                    <label htmlFor={`confirm-admin-${p.id}`}>
                                      Only if choosing Admin: I confirm. Admins manage roles, read
                                      the audit log and can reveal anonymous authors. At most two.
                                    </label>
                                  </div>
                                ) : null}
                                <ReasonField id={`role-reason-${p.id}`} />
                              </ActionForm>
                            </details>
                          )}
                          <details className="admin-details">
                            <summary>Correct name</summary>
                            <ActionForm
                              action={correctNameAction}
                              submitLabel="Save name"
                              label={`Correct name for ${p.full_name}`}
                            >
                              <input type="hidden" name="user" value={p.id} />
                              <div className="field">
                                <label htmlFor={`name-${p.id}`}>Name</label>
                                <input
                                  id={`name-${p.id}`}
                                  name="name"
                                  type="text"
                                  required
                                  maxLength={120}
                                  defaultValue={p.full_name}
                                />
                              </div>
                              <ReasonField
                                id={`name-reason-${p.id}`}
                                hint="Names are locked to Google's; correct only real mistakes. Kept in the audit log."
                              />
                            </ActionForm>
                          </details>
                          {p.onboarded_at && !(isOwner && !viewerIsOwner) ? (
                            <details className="admin-details">
                              <summary>Fix department or batch</summary>
                              <ActionForm
                                action={setUserDetailsAction}
                                submitLabel="Save"
                                label={`Fix department or batch for ${p.full_name}`}
                              >
                                <input type="hidden" name="user" value={p.id} />
                                <div className="field">
                                  <label htmlFor={`dept-${p.id}`}>Department</label>
                                  <select
                                    id={`dept-${p.id}`}
                                    name="department"
                                    defaultValue={p.department_id ?? ""}
                                  >
                                    {ref.departments.map((d) => (
                                      <option key={d.id} value={d.id}>
                                        {d.code} · {d.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="field">
                                  <label htmlFor={`batch-${p.id}`}>Batch</label>
                                  <select
                                    id={`batch-${p.id}`}
                                    name="batch"
                                    defaultValue={p.batch_id ?? ""}
                                  >
                                    {ref.batches.map((b) => (
                                      <option key={b.id} value={b.id}>
                                        {b.year}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <ReasonField id={`details-reason-${p.id}`} />
                              </ActionForm>
                            </details>
                          ) : null}
                          {p.onboarded_at ? (
                            <details className="admin-details">
                              <summary>View USN</summary>
                              <ActionForm
                                action={viewUsnAction}
                                submitLabel="Show USN"
                                label={`View USN for ${p.full_name}`}
                              >
                                <input type="hidden" name="user" value={p.id} />
                                <ReasonField
                                  id={`usn-reason-${p.id}`}
                                  hint="USNs are private. Look one up only to check a duplicate or verify a person. Your reason is kept in the audit log; the USN is not."
                                />
                              </ActionForm>
                            </details>
                          ) : null}
                          <details className="admin-details">
                            <summary>Remove all their comments</summary>
                            <ActionForm
                              action={removeUserCommentsAction}
                              submitLabel="Remove comments"
                              label={`Remove all comments by ${p.full_name}`}
                              danger
                            >
                              <input type="hidden" name="user" value={p.id} />
                              <div className="field">
                                <label htmlFor={`rc-code-${p.id}`}>Reason</label>
                                <select id={`rc-code-${p.id}`} name="reason_code" defaultValue="">
                                  <option value="" disabled>
                                    Choose…
                                  </option>
                                  {REASON_CODES.map((c) => (
                                    <option key={c} value={c}>
                                      {reasonLabels[c]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <ReasonField id={`rc-reason-${p.id}`} />
                            </ActionForm>
                          </details>
                          {p.role === "admin" || isOwner ? null : (
                            <>
                              <details className="admin-details">
                                <summary>{p.suspended_at ? "Lift suspension" : "Suspend"}</summary>
                                <ActionForm
                                  action={setSuspendedAction}
                                  submitLabel={p.suspended_at ? "Lift suspension" : "Suspend"}
                                  label={`${p.suspended_at ? "Lift suspension for" : "Suspend"} ${p.full_name}`}
                                  danger={!p.suspended_at}
                                >
                                  <input type="hidden" name="user" value={p.id} />
                                  <input
                                    type="hidden"
                                    name="suspend"
                                    value={p.suspended_at ? "false" : "true"}
                                  />
                                  <ReasonField
                                    id={`suspend-reason-${p.id}`}
                                    hint="A suspended member can still read but cannot post, comment, vote or report. Their posts stay up."
                                  />
                                </ActionForm>
                              </details>
                              <details className="admin-details">
                                <summary>Delete account</summary>
                                <ActionForm
                                  action={forceDeleteUserAction}
                                  submitLabel="Delete account"
                                  label={`Delete the account of ${p.full_name}`}
                                  danger
                                >
                                  <input type="hidden" name="user" value={p.id} />
                                  <div className="field">
                                    <label htmlFor={`del-confirm-${p.id}`}>
                                      Type DELETE to confirm
                                    </label>
                                    <input
                                      id={`del-confirm-${p.id}`}
                                      name="confirm_text"
                                      type="text"
                                      required
                                      autoComplete="off"
                                    />
                                  </div>
                                  <ReasonField
                                    id={`del-reason-${p.id}`}
                                    hint="The account is locked now; the daily clean-up deletes it with all its posts, comments and votes. This cannot be undone."
                                  />
                                </ActionForm>
                              </details>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </Container>
    </>
  );
}

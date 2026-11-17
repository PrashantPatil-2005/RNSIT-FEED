import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/layout/Container";
import { ActionForm, ReasonField } from "@/components/ui/ActionForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import { roleLabels } from "@/lib/admin/labels";
import { requireAdmin } from "@/lib/auth/staff";
import { assignDepartmentAction, unassignDepartmentAction } from "../actions";

export const metadata: Metadata = { title: "Moderator team · Admin", robots: { index: false } };

/** D-R3: 2 to 4 moderators per department (CLAUDE.md section 3). The database enforces the 4. */
const MIN = 2;
const MAX = 4;
const ACTIVITY_DAYS = 30;

interface Member {
  id: string;
  name: string;
}

function coverage(n: number): { label: string; cls: string } {
  if (n >= MAX) return { label: "Full", cls: "status--approved" };
  if (n >= MIN) return { label: "Covered", cls: "status--approved" };
  if (n === 0) return { label: "No moderators", cls: "status--rejected" };
  return { label: "Needs one more", cls: "status--pending" };
}

function when(ts: string | null): string {
  if (!ts) return "Never";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(ts));
}

export default async function AdminTeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireAdmin("/admin/team");
  const gapsOnly = (await searchParams).gaps === "1";

  const [cov, act, mods] = await Promise.all([
    viewer.db.rpc("admin_moderator_coverage"),
    viewer.db.rpc("admin_moderator_activity", { p_days: ACTIVITY_DAYS }),
    // Admin-only read (RLS profiles_read_admin): names of current moderators for the picker.
    viewer.db
      .from("profiles")
      .select("id, full_name")
      .eq("role", "moderator")
      .is("deletion_requested_at", null)
      .order("full_name"),
  ]);
  const depts = cov.data ?? [];
  const short = depts.filter((d) => d.moderator_count < MIN);
  const covered = depts.length - short.length;
  const shown = gapsOnly ? short : depts;
  const moderators = mods.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Moderator team"
        description={`Each department should have ${MIN} to ${MAX} moderators. Their queue opens on their departments, but they can review any department.`}
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <AdminNav current="/admin/team" />

          {cov.error ? (
            <StateMessage kind="error" title="The team could not be loaded">
              <p>Please reload the page.</p>
            </StateMessage>
          ) : (
            <>
              <dl className="stats stats--cards" aria-label="Coverage summary">
                <div>
                  <dt>Moderators</dt>
                  <dd>{moderators.length}</dd>
                </div>
                <div>
                  <dt>Departments covered ({MIN}+)</dt>
                  <dd>
                    {covered} / {depts.length}
                  </dd>
                </div>
                <div>
                  <dt>Need moderators</dt>
                  <dd>{short.length}</dd>
                </div>
              </dl>

              <section className="panel stack" aria-labelledby="assign-title">
                <h2 id="assign-title" className="panel__title">
                  Assign a department
                </h2>
                {moderators.length === 0 ? (
                  <p>
                    There are no moderators yet. Make someone a moderator in{" "}
                    <Link href="/admin/users">Users and roles</Link> first.
                  </p>
                ) : (
                  <ActionForm
                    action={assignDepartmentAction}
                    submitLabel="Assign"
                    label="Assign a moderator to a department"
                  >
                    <div className="admin-search">
                      <div className="field">
                        <label htmlFor="assign-user">Moderator</label>
                        <select id="assign-user" name="user" required defaultValue="">
                          <option value="" disabled>
                            Choose…
                          </option>
                          {moderators.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="assign-dept">Department</label>
                        <select id="assign-dept" name="department" required defaultValue="">
                          <option value="" disabled>
                            Choose…
                          </option>
                          {depts.map((d) => (
                            <option key={d.department_id} value={d.department_id}>
                              {d.code} · {d.name} ({d.moderator_count}/{MAX})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <ReasonField id="assign-reason" />
                  </ActionForm>
                )}
              </section>

              <section className="stack" aria-labelledby="coverage-title">
                <div className="team-head">
                  <h2 id="coverage-title" className="panel__title">
                    Departments
                  </h2>
                  <nav aria-label="Department filter" className="scope-switch">
                    <Link href="/admin/team" aria-current={gapsOnly ? undefined : "page"}>
                      All ({depts.length})
                    </Link>
                    <Link href="/admin/team?gaps=1" aria-current={gapsOnly ? "page" : undefined}>
                      Need moderators ({short.length})
                    </Link>
                  </nav>
                </div>
                {shown.length === 0 ? (
                  <StateMessage title="Every department is covered">
                    <p>Each department has at least {MIN} moderators.</p>
                  </StateMessage>
                ) : (
                  <ul className="my-list list-reset" aria-label="Departments and moderators">
                    {shown.map((d) => {
                      const c = coverage(d.moderator_count);
                      const members = (d.moderators as unknown as Member[]) ?? [];
                      return (
                        <li key={d.department_id} className="my-item team-dept">
                          <div>
                            <p className="my-item__title">
                              {d.code} <span className="muted">· {d.name}</span>
                            </p>
                            <p className="my-item__meta">
                              <span className={`status ${c.cls}`}>{c.label}</span>
                              <span>
                                {d.moderator_count} of {MAX}
                              </span>
                            </p>
                          </div>
                          {members.length > 0 ? (
                            <ul className="team-members list-reset">
                              {members.map((m) => (
                                <li key={m.id}>
                                  <span>{m.name}</span>
                                  <details className="admin-details">
                                    <summary>
                                      Remove
                                      <span className="visually-hidden">
                                        {" "}
                                        {m.name} from {d.code}
                                      </span>
                                    </summary>
                                    <ActionForm
                                      action={unassignDepartmentAction}
                                      submitLabel="Remove from department"
                                      label={`Remove ${m.name} from ${d.code}`}
                                      danger
                                    >
                                      <input type="hidden" name="user" value={m.id} />
                                      <input
                                        type="hidden"
                                        name="department"
                                        value={d.department_id}
                                      />
                                      <ReasonField id={`unassign-${d.department_id}-${m.id}`} />
                                    </ActionForm>
                                  </details>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="stack" aria-labelledby="activity-title">
                <h2 id="activity-title" className="panel__title">
                  Activity, last {ACTIVITY_DAYS} days
                </h2>
                <p className="muted">
                  Counts only: approvals, requests for changes, rejections, removals and report
                  decisions. No post content is shown.
                </p>
                {(act.data ?? []).length === 0 ? (
                  <StateMessage title="No staff yet">
                    <p>Moderators and admins will be listed here.</p>
                  </StateMessage>
                ) : (
                  <ul className="my-list list-reset" aria-label="Staff activity">
                    {(act.data ?? []).map((a) => (
                      <li key={a.user_id} className="my-item">
                        <div>
                          <p className="my-item__title">{a.full_name}</p>
                          <p className="my-item__meta">
                            <span className={`status status--role-${a.role}`}>
                              {roleLabels[a.role]}
                            </span>
                            <span>
                              {a.decisions} {a.decisions === 1 ? "decision" : "decisions"}
                            </span>
                            <span>Last decision: {when(a.last_decision_at)}</span>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </Container>
    </>
  );
}

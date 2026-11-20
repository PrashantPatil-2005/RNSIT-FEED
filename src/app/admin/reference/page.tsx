import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/layout/Container";
import { ActionForm, ReasonField } from "@/components/ui/ActionForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import { requireAdmin } from "@/lib/auth/staff";
import {
  createBatchAction,
  createDepartmentAction,
  deleteBatchAction,
  updateDepartmentAction,
} from "../actions";

export const metadata: Metadata = {
  title: "Departments and batches · Admin",
  robots: { index: false },
};

export default async function AdminReferencePage() {
  const viewer = await requireAdmin("/admin/reference");
  const [departments, batches, usage] = await Promise.all([
    viewer.db.from("departments").select("id, code, name, active").order("code"),
    viewer.db.from("batches").select("id, grad_year").order("grad_year", { ascending: false }),
    viewer.db.rpc("admin_reference_usage"),
  ]);
  const usesOf = (kind: string, id: number) =>
    usage.data?.find((u) => u.kind === kind && u.ref_id === String(id))?.uses ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Departments and batches"
        description="The branches and graduation years members choose from. Department codes never change; hide a department instead of deleting it. A batch can be deleted only while nobody uses it."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <AdminNav current="/admin/reference" />

          {departments.error || batches.error ? (
            <StateMessage kind="error" title="This page could not be loaded">
              <p>Please reload the page.</p>
            </StateMessage>
          ) : (
            <>
              <section aria-labelledby="new-dept" className="panel">
                <h2 id="new-dept" className="panel__title">
                  Add a department
                </h2>
                <ActionForm
                  action={createDepartmentAction}
                  submitLabel="Add department"
                  label="Add a department"
                >
                  <div className="field">
                    <label htmlFor="dept-code">Code</label>
                    <input
                      id="dept-code"
                      name="code"
                      type="text"
                      required
                      minLength={2}
                      maxLength={2}
                      pattern="[A-Za-z]{2}"
                      aria-describedby="dept-code-hint"
                      spellCheck={false}
                    />
                    <p id="dept-code-hint" className="field__hint">
                      Two letters, for example CS. It cannot be changed later.
                    </p>
                  </div>
                  <div className="field">
                    <label htmlFor="dept-name">Name</label>
                    <input
                      id="dept-name"
                      name="name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </div>
                  <ReasonField id="dept-reason" />
                </ActionForm>
              </section>

              <section aria-labelledby="dept-list" className="stack">
                <h2 id="dept-list">
                  Departments <span className="muted">({departments.data.length})</span>
                </h2>
                <ul className="my-list list-reset" aria-label="Departments">
                  {departments.data.map((d) => {
                    const used = usesOf("department", d.id);
                    return (
                      <li key={d.id} className="my-item">
                        <div>
                          <p className="my-item__title">
                            {d.code} · {d.name}{" "}
                            {d.active ? null : (
                              <span className="status status--rejected">Hidden</span>
                            )}
                          </p>
                          <p className="my-item__meta">
                            <span>
                              Used by {used} {used === 1 ? "post or member" : "posts and members"}
                            </span>
                          </p>
                        </div>
                        <details className="admin-details">
                          <summary>Edit</summary>
                          <ActionForm
                            action={updateDepartmentAction}
                            submitLabel="Save"
                            label={`Edit ${d.code}`}
                          >
                            <input type="hidden" name="department" value={d.id} />
                            <div className="field">
                              <label htmlFor={`dname-${d.id}`}>Name</label>
                              <input
                                id={`dname-${d.id}`}
                                name="name"
                                type="text"
                                required
                                minLength={2}
                                maxLength={120}
                                defaultValue={d.name}
                              />
                            </div>
                            <div className="check">
                              <input
                                id={`dactive-${d.id}`}
                                name="active"
                                type="checkbox"
                                value="yes"
                                defaultChecked={d.active}
                              />
                              <label htmlFor={`dactive-${d.id}`}>
                                Offered to members (untick to hide it from sign-up, posts and
                                filters; existing posts keep it)
                              </label>
                            </div>
                            <ReasonField id={`dreason-${d.id}`} />
                          </ActionForm>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section aria-labelledby="new-batch" className="panel">
                <h2 id="new-batch" className="panel__title">
                  Add a batch
                </h2>
                <ActionForm action={createBatchAction} submitLabel="Add batch" label="Add a batch">
                  <div className="field">
                    <label htmlFor="batch-year">Graduation year</label>
                    <input
                      id="batch-year"
                      name="year"
                      type="number"
                      required
                      min={2000}
                      max={2100}
                    />
                  </div>
                  <ReasonField id="batch-reason" />
                </ActionForm>
              </section>

              <section aria-labelledby="batch-list" className="stack">
                <h2 id="batch-list">
                  Batches <span className="muted">({batches.data.length})</span>
                </h2>
                <ul className="my-list list-reset" aria-label="Batches">
                  {batches.data.map((b) => {
                    const used = usesOf("batch", b.id);
                    return (
                      <li key={b.id} className="my-item">
                        <div>
                          <p className="my-item__title">Batch {b.grad_year}</p>
                          <p className="my-item__meta">
                            <span>
                              Used by {used} {used === 1 ? "post or member" : "posts and members"}
                            </span>
                          </p>
                        </div>
                        {used === 0 ? (
                          <details className="admin-details">
                            <summary>Delete</summary>
                            <ActionForm
                              action={deleteBatchAction}
                              submitLabel="Delete batch"
                              label={`Delete batch ${b.grad_year}`}
                              danger
                            >
                              <input type="hidden" name="batch" value={b.id} />
                              <ReasonField id={`breason-${b.id}`} />
                            </ActionForm>
                          </details>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}
        </div>
      </Container>
    </>
  );
}

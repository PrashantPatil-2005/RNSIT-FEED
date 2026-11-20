import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, ReasonField } from "@/components/ui/ActionForm";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import { requireAdmin } from "@/lib/auth/staff";
import {
  addAliasAction,
  createCompanyAction,
  deleteCompanyAction,
  mergeCompanyAction,
  removeAliasAction,
  renameCompanyAction,
} from "../actions";

export const metadata: Metadata = { title: "Companies · Admin", robots: { index: false } };

export default async function AdminCompaniesPage() {
  const viewer = await requireAdmin("/admin/companies");
  const [companies, aliases, usage] = await Promise.all([
    viewer.db.from("companies").select("id, name, slug, listed").order("name").limit(1000),
    viewer.db.from("company_aliases").select("company_id, alias").order("alias").limit(5000),
    viewer.db.rpc("admin_reference_usage"),
  ]);
  // Posts of any status per company (counts only). Delete is offered only at zero.
  const uses = new Map(
    (usage.data ?? []).filter((u) => u.kind === "company").map((u) => [u.ref_id, u.uses]),
  );
  const aliasesOf = (id: string) =>
    (aliases.data ?? []).filter((a) => a.company_id === id).map((a) => a.alias);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Companies"
        description="Members pick from this list or type a new name when posting; a new name stays unlisted (hidden) until a post using it is approved, and is removed automatically if no post uses it. Aliases group other spellings under one company in search. Rename or merge instead of deleting: a company can be deleted only while no post uses it."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <AdminNav current="/admin/companies" />

          <section aria-labelledby="new-company" className="panel">
            <h2 id="new-company" className="panel__title">
              Add a company
            </h2>
            <ActionForm
              action={createCompanyAction}
              submitLabel="Add company"
              label="Add a company"
            >
              <div className="field">
                <label htmlFor="company-name">Name</label>
                <input id="company-name" name="name" type="text" required maxLength={120} />
              </div>
              <div className="field">
                <label htmlFor="company-slug">Web address (optional)</label>
                <input
                  id="company-slug"
                  name="slug"
                  type="text"
                  maxLength={80}
                  pattern="[a-z0-9\-]*"
                  aria-describedby="company-slug-hint"
                  spellCheck={false}
                />
                <p id="company-slug-hint" className="field__hint">
                  Lowercase letters, numbers and dashes, used in /companies/&lt;address&gt;. Left
                  empty, it is made from the name. It cannot be changed later.
                </p>
              </div>
              <ReasonField id="company-reason" />
            </ActionForm>
          </section>

          <section aria-labelledby="company-list" className="stack">
            <h2 id="company-list">
              All companies <span className="muted">({companies.data?.length ?? 0})</span>
            </h2>
            {companies.error || aliases.error ? (
              <StateMessage kind="error" title="Companies could not be loaded">
                <p>Please reload the page.</p>
              </StateMessage>
            ) : !companies.data || companies.data.length === 0 ? (
              <StateMessage title="No companies yet">
                <p>Add the first company above.</p>
              </StateMessage>
            ) : (
              <ul className="my-list list-reset" aria-label="Companies">
                {companies.data.map((c) => {
                  const list = aliasesOf(c.id);
                  const posts = uses.get(c.id) ?? 0;
                  const others = companies.data.filter((o) => o.id !== c.id);
                  return (
                    <li key={c.id} className="my-item">
                      <div>
                        <p className="my-item__title">
                          {c.listed ? (
                            <Link href={`/companies/${c.slug}`}>{c.name}</Link>
                          ) : (
                            <>
                              {c.name} <span className="muted">(new, not listed yet)</span>
                            </>
                          )}
                        </p>
                        <p className="my-item__meta">
                          <span>/companies/{c.slug}</span>
                          <span>
                            {list.length ? `Also known as: ${list.join(", ")}` : "No aliases"}
                          </span>
                          <span>
                            {posts} {posts === 1 ? "post" : "posts"}
                          </span>
                        </p>
                      </div>
                      <div className="admin-user__actions">
                        <details className="admin-details">
                          <summary>Add alias</summary>
                          <ActionForm
                            action={addAliasAction}
                            submitLabel="Add alias"
                            label={`Add alias for ${c.name}`}
                          >
                            <input type="hidden" name="company" value={c.id} />
                            <div className="field">
                              <label htmlFor={`alias-${c.id}`}>Alias</label>
                              <input
                                id={`alias-${c.id}`}
                                name="alias"
                                type="text"
                                required
                                maxLength={120}
                              />
                            </div>
                            <ReasonField id={`alias-reason-${c.id}`} />
                          </ActionForm>
                        </details>
                        <details className="admin-details">
                          <summary>Rename</summary>
                          <ActionForm
                            action={renameCompanyAction}
                            submitLabel="Rename"
                            label={`Rename ${c.name}`}
                          >
                            <input type="hidden" name="company" value={c.id} />
                            <div className="field">
                              <label htmlFor={`cname-${c.id}`}>New name</label>
                              <input
                                id={`cname-${c.id}`}
                                name="name"
                                type="text"
                                required
                                maxLength={120}
                                defaultValue={c.name}
                                aria-describedby={`cname-hint-${c.id}`}
                              />
                              <p id={`cname-hint-${c.id}`} className="field__hint">
                                The web address stays the same. The old name becomes an alias.
                              </p>
                            </div>
                            <ReasonField id={`cname-reason-${c.id}`} />
                          </ActionForm>
                        </details>
                        {list.length ? (
                          <details className="admin-details">
                            <summary>Remove alias</summary>
                            <ActionForm
                              action={removeAliasAction}
                              submitLabel="Remove alias"
                              label={`Remove alias from ${c.name}`}
                              danger
                            >
                              <input type="hidden" name="company" value={c.id} />
                              <div className="field">
                                <label htmlFor={`ralias-${c.id}`}>Alias</label>
                                <select id={`ralias-${c.id}`} name="alias" required>
                                  {list.map((a) => (
                                    <option key={a} value={a}>
                                      {a}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <ReasonField id={`ralias-reason-${c.id}`} />
                            </ActionForm>
                          </details>
                        ) : null}
                        {others.length ? (
                          <details className="admin-details">
                            <summary>Merge into another</summary>
                            <ActionForm
                              action={mergeCompanyAction}
                              submitLabel="Merge"
                              label={`Merge ${c.name} into another company`}
                              danger
                            >
                              <input type="hidden" name="company" value={c.id} />
                              <div className="field">
                                <label htmlFor={`merge-${c.id}`}>Keep this company</label>
                                <select id={`merge-${c.id}`} name="into" required defaultValue="">
                                  <option value="" disabled>
                                    Choose…
                                  </option>
                                  {others.map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {o.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="check">
                                <input
                                  id={`confirm-merge-${c.id}`}
                                  name="confirm_merge"
                                  type="checkbox"
                                  value="yes"
                                />
                                <label htmlFor={`confirm-merge-${c.id}`}>
                                  I confirm. All {posts} {posts === 1 ? "post" : "posts"} and
                                  aliases move to the chosen company, {c.name} becomes its alias,
                                  and /companies/{c.slug} stops working. This cannot be undone.
                                </label>
                              </div>
                              <ReasonField id={`merge-reason-${c.id}`} />
                            </ActionForm>
                          </details>
                        ) : null}
                        {posts === 0 ? (
                          <details className="admin-details">
                            <summary>Delete</summary>
                            <ActionForm
                              action={deleteCompanyAction}
                              submitLabel="Delete company"
                              label={`Delete ${c.name}`}
                              danger
                            >
                              <input type="hidden" name="company" value={c.id} />
                              <ReasonField id={`delete-reason-${c.id}`} />
                            </ActionForm>
                          </details>
                        ) : null}
                      </div>
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

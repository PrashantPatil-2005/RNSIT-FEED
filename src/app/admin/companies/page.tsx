import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, ReasonField } from "@/components/ui/ActionForm";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import { requireAdmin } from "@/lib/auth/staff";
import { addAliasAction, createCompanyAction } from "../actions";

export const metadata: Metadata = { title: "Companies · Admin", robots: { index: false } };

export default async function AdminCompaniesPage() {
  const viewer = await requireAdmin("/admin/companies");
  const [companies, aliases] = await Promise.all([
    viewer.db.from("companies").select("id, name, slug").order("name").limit(1000),
    viewer.db.from("company_aliases").select("company_id, alias").order("alias").limit(5000),
  ]);
  const aliasesOf = (id: string) =>
    (aliases.data ?? []).filter((a) => a.company_id === id).map((a) => a.alias);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Companies"
        description="Members choose from this list when posting. Aliases group other spellings under one company in search."
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
                  return (
                    <li key={c.id} className="my-item">
                      <div>
                        <p className="my-item__title">
                          <Link href={`/companies/${c.slug}`}>{c.name}</Link>
                        </p>
                        <p className="my-item__meta">
                          <span>/companies/{c.slug}</span>
                          <span>
                            {list.length ? `Also known as: ${list.join(", ")}` : "No aliases"}
                          </span>
                        </p>
                      </div>
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

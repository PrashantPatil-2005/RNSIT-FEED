import type { Metadata } from "next";
import { ActionForm, ReasonField } from "@/components/ui/ActionForm";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import { requireAdmin } from "@/lib/auth/staff";
import { createTopicAction, renameTopicAction } from "../actions";

export const metadata: Metadata = { title: "Topics · Admin", robots: { index: false } };

export default async function AdminTopicsPage() {
  const viewer = await requireAdmin("/admin/topics");
  const topics = await viewer.db.from("topics").select("id, name, slug").order("name").limit(500);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Topics"
        description="Members tag interview rounds and questions with these topics (DSA, DBMS and so on). Topics can be added or renamed, not deleted, because published posts use them."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <AdminNav current="/admin/topics" />

          <section aria-labelledby="new-topic" className="panel">
            <h2 id="new-topic" className="panel__title">
              Add a topic
            </h2>
            <ActionForm action={createTopicAction} submitLabel="Add topic" label="Add a topic">
              <div className="field">
                <label htmlFor="topic-name">Name</label>
                <input
                  id="topic-name"
                  name="name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </div>
              <div className="field">
                <label htmlFor="topic-slug">Short code (optional)</label>
                <input
                  id="topic-slug"
                  name="slug"
                  type="text"
                  maxLength={40}
                  pattern="[a-z0-9\-]*"
                  aria-describedby="topic-slug-hint"
                  spellCheck={false}
                />
                <p id="topic-slug-hint" className="field__hint">
                  Lowercase letters, numbers and dashes. Left empty, it is made from the name. It
                  cannot be changed later.
                </p>
              </div>
              <ReasonField id="topic-reason" />
            </ActionForm>
          </section>

          <section aria-labelledby="topic-list" className="stack">
            <h2 id="topic-list">
              All topics <span className="muted">({topics.data?.length ?? 0})</span>
            </h2>
            {topics.error ? (
              <StateMessage kind="error" title="Topics could not be loaded">
                <p>Please reload the page.</p>
              </StateMessage>
            ) : !topics.data || topics.data.length === 0 ? (
              <StateMessage title="No topics yet">
                <p>
                  Add the first topic above. Until there is one, the topic picker is hidden in the
                  post form.
                </p>
              </StateMessage>
            ) : (
              <ul className="my-list list-reset" aria-label="Topics">
                {topics.data.map((t) => (
                  <li key={t.id} className="my-item">
                    <div>
                      <p className="my-item__title">{t.name}</p>
                      <p className="my-item__meta">
                        <span>Code: {t.slug}</span>
                      </p>
                    </div>
                    <details className="admin-details">
                      <summary>Rename</summary>
                      <ActionForm
                        action={renameTopicAction}
                        submitLabel="Rename"
                        label={`Rename ${t.name}`}
                      >
                        <input type="hidden" name="topic" value={t.id} />
                        <div className="field">
                          <label htmlFor={`topic-name-${t.id}`}>New name</label>
                          <input
                            id={`topic-name-${t.id}`}
                            name="name"
                            type="text"
                            required
                            minLength={2}
                            maxLength={80}
                            defaultValue={t.name}
                          />
                        </div>
                        <ReasonField id={`topic-reason-${t.id}`} />
                      </ActionForm>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Container>
    </>
  );
}

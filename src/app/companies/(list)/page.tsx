import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import { listCompanies } from "@/lib/data/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Companies",
  description: "Every company with placement experiences shared by RNSIT students and alumni.",
};

export default async function CompaniesPage() {
  const db = await createSupabaseServerClient();
  if (!db) return <NotConfigured />;
  const companies = await listCompanies(db);
  const withPosts = companies.filter((c) => c.postCount > 0);
  const withoutPosts = companies.filter((c) => c.postCount === 0);

  return (
    <>
      <PageHeader
        eyebrow="Companies"
        title="Companies"
        description="Each page collects every approved experience for that company, with a short summary."
      />
      <Container>
        <div className="section section--tight stack--lg">
          {companies.length === 0 ? (
            <StateMessage title="No companies listed yet">
              <p>
                Companies are added by the site admins. They will appear here once the list is
                seeded.
              </p>
            </StateMessage>
          ) : null}
          {withPosts.length ? (
            <ul className="company-grid list-reset" aria-label="Companies with experiences">
              {withPosts.map((c) => (
                <li key={c.id}>
                  <Link href={`/companies/${c.slug}`} className="company-card">
                    <span className="company-card__name">{c.name}</span>
                    <span className="company-card__meta">
                      {c.postCount} experience{c.postCount === 1 ? "" : "s"}
                      {c.avgDifficulty !== null
                        ? ` · avg difficulty ${c.avgDifficulty.toFixed(1)}/5`
                        : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {withoutPosts.length ? (
            <section aria-labelledby="no-posts-title" className="stack">
              <h2 id="no-posts-title" className="h-small">
                No experiences yet
              </h2>
              <p className="muted">
                Know how one of these recruits? Sharing opens once verified sign-in is available.
              </p>
              <ul className="cluster list-reset">
                {withoutPosts.map((c) => (
                  <li key={c.id}>
                    <Link href={`/companies/${c.slug}`} className="tag tag--link">
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </Container>
    </>
  );
}

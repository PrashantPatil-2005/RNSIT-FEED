import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { PageHeader } from "@/components/ui/PageHeader";
import { SampleBadge, SampleNotice } from "@/components/ui/Sample";
import { StateMessage } from "@/components/ui/StateMessage";
import { roundLabels, type RoundType } from "@/lib/data/labels";
import { listCompanies, type CompanyStats } from "@/lib/data/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Companies",
  description: "Every company with placement experiences shared by RNSIT students and alumni.",
};

function topRound(c: CompanyStats): string | null {
  const top = (Object.entries(c.roundTypeCounts) as [RoundType, number][]).sort(
    (a, b) => b[1] - a[1],
  )[0];
  return top ? roundLabels[top[0]] : null;
}

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
        <div className="section section--tight stack stack--lg">
          <SampleNotice>
            The companies and statistics below come from synthetic sample data created for testing.
            They do not describe real recruitment at these or any companies.
          </SampleNotice>

          {companies.length === 0 ? (
            <StateMessage title="No companies listed yet">
              <p>
                Companies are added by the site admins. They will appear here once the list is
                seeded.
              </p>
            </StateMessage>
          ) : null}

          {withPosts.length ? (
            <section aria-labelledby="with-posts-title" className="stack">
              <h2 id="with-posts-title" className="h-small">
                With experiences{" "}
                <span className="muted">
                  ({withPosts.length} compan{withPosts.length === 1 ? "y" : "ies"})
                </span>
              </h2>
              <ul className="company-list list-reset">
                {withPosts.map((c) => {
                  const round = topRound(c);
                  return (
                    <li key={c.id}>
                      <Link href={`/companies/${c.slug}`} className="company-row">
                        <span className="company-row__name">{c.name}</span>
                        <span className="company-row__meta">
                          <span>
                            {c.postCount} experience{c.postCount === 1 ? "" : "s"}
                          </span>
                          {c.avgDifficulty !== null ? (
                            <span>Avg difficulty {c.avgDifficulty.toFixed(1)}/5</span>
                          ) : null}
                          {round ? <span>Most common: {round}</span> : null}
                          <SampleBadge />
                        </span>
                        <span className="company-row__arrow" aria-hidden="true">
                          →
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {withoutPosts.length ? (
            <section aria-labelledby="no-posts-title" className="stack company-empty">
              <h2 id="no-posts-title" className="h-small">
                Listed, no experiences yet
              </h2>
              <p className="muted">
                These companies are on the list but nobody has shared an experience for them yet.
              </p>
              <ul className="cluster cluster--tight list-reset">
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

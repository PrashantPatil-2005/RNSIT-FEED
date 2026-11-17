import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { ExperienceCard } from "@/components/experience/ExperienceCard";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";
import { parseFilters } from "@/lib/data/filters";
import {
  getReferenceData,
  listCompanies,
  searchExperiences,
  type CompanyStats,
  type ExperienceSummary,
} from "@/lib/data/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function loadHome(): Promise<{
  latest: ExperienceSummary[];
  companies: CompanyStats[];
} | null> {
  const db = await createSupabaseServerClient();
  if (!db) return null;
  const reference = await getReferenceData(db);
  const [page, companies] = await Promise.all([
    searchExperiences(db, parseFilters({}), reference, 6),
    listCompanies(db),
  ]);
  return { latest: page.items, companies: companies.filter((c) => c.postCount > 0).slice(0, 8) };
}

export default async function HomePage() {
  const home = await loadHome();
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <Container>
          <div className="hero__inner">
            <div className="cluster">
              <Badge tone="accent">Early preview · reading is open</Badge>
            </div>
            <h1 id="hero-title">What RNSIT seniors learned, available to the next batch.</h1>
            <p className="lead">
              RNSIT FEED is a free, structured archive of real placement experiences, organised by
              company, department, batch and opportunity type, so every batch can prepare from what
              actually happened before.
            </p>
            <div className="hero__actions">
              <ButtonLink href="/experiences">Browse experiences</ButtonLink>
              <ButtonLink href="/companies" variant="secondary">
                Explore companies
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>

      <section className="section section--surface" aria-labelledby="problem-title">
        <Container>
          <div className="section__head">
            <p className="eyebrow">The problem</p>
            <h2 id="problem-title">Placement knowledge keeps leaving with each batch.</h2>
          </div>
          <ul className="checklist">
            <li>It is scattered across WhatsApp groups, personal chats and individual memory.</li>
            <li>When a batch graduates, most of what it learned goes with it.</li>
            <li>
              Juniors fall back on generic internet advice that does not reflect how companies
              recruit at RNSIT.
            </li>
          </ul>
        </Container>
      </section>

      <section className="section" aria-labelledby="latest-title">
        <Container>
          <div className="section__head section__head--row">
            <div className="stack">
              <p className="eyebrow">Latest</p>
              <h2 id="latest-title">Recently published experiences</h2>
            </div>
            <Link href="/experiences">View all</Link>
          </div>
          {home === null ? (
            <StateMessage kind="error" title="Content is not available right now">
              <p>The site cannot reach its database. Please try again later.</p>
            </StateMessage>
          ) : home.latest.length === 0 ? (
            <StateMessage title="No experiences published yet">
              <p>Approved experiences from seniors will appear here first.</p>
            </StateMessage>
          ) : (
            <ul className="exp-grid list-reset">
              {home.latest.map((exp) => (
                <li key={exp.id}>
                  <ExperienceCard exp={exp} />
                </li>
              ))}
            </ul>
          )}
          {home && home.companies.length ? (
            <div className="stack" style={{ marginTop: "var(--space-6)" }}>
              <h3 className="h-small">Companies with experiences</h3>
              <ul className="cluster list-reset">
                {home.companies.map((c) => (
                  <li key={c.id}>
                    <Link href={`/companies/${c.slug}`} className="tag tag--link">
                      {c.name} <span className="muted">({c.postCount})</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Container>
      </section>

      <section className="section section--bordered" aria-labelledby="how-title">
        <Container>
          <div className="section__head">
            <p className="eyebrow">How it is intended to work</p>
            <h2 id="how-title">Open to read, careful to write.</h2>
          </div>
          <ol className="steps">
            <li>
              <h3>Read freely</h3>
              <p>Anyone can browse published experiences and company pages without signing in.</p>
            </li>
            <li>
              <h3>Contribute as a verified member</h3>
              <p>
                Only verified RNSIT students and alumni can post, comment, vote or report. Sign-in
                opens soon.
              </p>
            </li>
            <li>
              <h3>Reviewed before it appears</h3>
              <p>
                Moderators approve posts first, and confidential or personal material is rejected.
              </p>
            </li>
          </ol>
        </Container>
      </section>

      <section className="section section--surface" aria-labelledby="independent-title">
        <Container>
          <div className="stack">
            <h2 id="independent-title">An independent student initiative</h2>
            <p>
              RNSIT FEED is not an official RNSIT platform and is not affiliated with the institute.
              It does not replace announcements from the Training and Placement cell.{" "}
              <Link href="/disclaimer">Read the full disclaimer</Link>.
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}

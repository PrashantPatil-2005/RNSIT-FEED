import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { ExperienceCard } from "@/components/experience/ExperienceCard";
import { ButtonLink } from "@/components/ui/Button";
import { SampleNotice } from "@/components/ui/Sample";
import { StateMessage } from "@/components/ui/StateMessage";
import { parseFilters } from "@/lib/data/filters";
import {
  getReferenceData,
  listCompanies,
  listMostHelpful,
  searchExperiences,
  type CompanyStats,
  type ExperienceSummary,
} from "@/lib/data/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function loadHome(): Promise<{
  latest: ExperienceSummary[];
  mostHelpful: ExperienceSummary[];
  companies: CompanyStats[];
  totalPosts: number;
  coveredCompanies: number;
} | null> {
  const db = await createSupabaseServerClient();
  if (!db) return null;
  const reference = await getReferenceData(db);
  const [page, mostHelpful, companies] = await Promise.all([
    searchExperiences(db, parseFilters({}), reference, 6),
    listMostHelpful(db, 3),
    listCompanies(db),
  ]);
  const covered = companies.filter((c) => c.postCount > 0);
  return {
    latest: page.items,
    mostHelpful,
    companies: covered.slice(0, 8),
    totalPosts: covered.reduce((sum, c) => sum + c.postCount, 0),
    coveredCompanies: covered.length,
  };
}

export default async function HomePage() {
  const home = await loadHome();
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <Container>
          <div className="hero__inner">
            <h1 id="hero-title">
              Placement experiences from RNSIT seniors, <em>by company.</em>
            </h1>
            <p className="lead">
              Round-by-round accounts of how companies hired at RNSIT: what was asked, how hard it
              was, and what the outcome was. Written by students and alumni, checked by moderators,
              free to read.
            </p>
            {home ? (
              <dl className="hero__meta">
                <div>
                  <dt>experiences</dt>
                  <dd>{home.totalPosts}</dd>
                </div>
                <div>
                  <dt>companies</dt>
                  <dd>{home.coveredCompanies}</dd>
                </div>
              </dl>
            ) : null}
            <div className="hero__actions">
              <ButtonLink href="/experiences">Browse experiences</ButtonLink>
              <ButtonLink href="/companies" variant="secondary">
                Companies
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>

      {home && home.mostHelpful.length ? (
        <section className="section" aria-labelledby="helpful-title">
          <Container>
            <div className="section__head section__head--row">
              <h2 id="helpful-title">Most helpful</h2>
            </div>
            <ul className="exp-grid list-reset">
              {home.mostHelpful.map((exp) => (
                <li key={exp.id}>
                  <ExperienceCard exp={exp} />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      <section className="section" aria-labelledby="latest-title">
        <Container>
          <div className="section__head section__head--row">
            <h2 id="latest-title">Recently published experiences</h2>
            <Link href="/experiences">All experiences</Link>
          </div>
          <SampleNotice />
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
            <div className="stack home-companies">
              <h3 className="h-small">Companies with experiences</h3>
              <ul className="cluster list-reset">
                {home.companies.map((c) => (
                  <li key={c.id}>
                    <Link href={`/companies/${c.slug}`} className="tag tag--link">
                      {c.name} <span className="muted">{c.postCount}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Container>
      </section>

      <section className="section section--surface" aria-labelledby="about-title">
        <Container>
          <div className="about">
            <div className="stack">
              <h2 id="about-title">Why this exists</h2>
              <p>
                Placement knowledge at RNSIT lives in WhatsApp groups, private chats and the memory
                of whoever went through it. Each batch that graduates takes most of it along, and
                the next one prepares from generic advice that does not match how companies recruit
                here.
              </p>
              <p className="muted">
                RNSIT FEED is an independent student initiative. It is not an official RNSIT
                platform and does not replace Training and Placement cell announcements.{" "}
                <Link href="/disclaimer">Disclaimer</Link>
              </p>
            </div>
            <dl className="about__rules">
              <div>
                <dt>Reading</dt>
                <dd>Open to everyone. No account needed for posts, companies or search.</dd>
              </div>
              <div>
                <dt>Posting</dt>
                <dd>
                  Verified RNSIT students and alumni only. The same applies to comments, votes and
                  reports.
                </dd>
              </div>
              <div>
                <dt>Review</dt>
                <dd>
                  Every post is approved by a moderator first. Confidential company material and
                  personal details are rejected. <Link href="/guidelines">Guidelines</Link>
                </dd>
              </div>
            </dl>
          </div>
        </Container>
      </section>
    </>
  );
}

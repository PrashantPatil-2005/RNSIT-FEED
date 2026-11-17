import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Container } from "@/components/layout/Container";
import { ExperienceResults } from "@/components/experience/ExperienceResults";
import { FilterBar } from "@/components/experience/FilterBar";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { parseFilters, type RawSearchParams } from "@/lib/data/filters";
import { resultLabels, roundLabels, type ResultType, type RoundType } from "@/lib/data/labels";
import { getCompany, getReferenceData, searchExperiences } from "@/lib/data/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

const load = cache(async (slug: string) => {
  const db = await createSupabaseServerClient();
  if (!db) return null;
  const company = /^[a-z0-9-]{1,80}$/.test(slug) ? await getCompany(db, slug) : null;
  return { db, company };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load((await params).slug);
  if (!r?.company) return { title: "Company" };
  return {
    title: r.company.name,
    description: `${r.company.postCount} placement experience(s) at ${r.company.name} shared by RNSIT students and alumni.`,
  };
}

export default async function CompanyPage({ params, searchParams }: Props) {
  const slug = (await params).slug;
  const r = await load(slug);
  if (!r) return <NotConfigured />;
  const { db, company } = r;
  if (!company) notFound();

  const filters = { ...parseFilters(await searchParams), company: company.slug };
  const reference = await getReferenceData(db);
  const page = await searchExperiences(db, filters, reference);
  const rounds = Object.entries(company.roundTypeCounts).sort((a, b) => b[1] - a[1]) as [
    RoundType,
    number,
  ][];
  const results = Object.entries(company.resultCounts).sort((a, b) => b[1] - a[1]) as [
    ResultType,
    number,
  ][];

  return (
    <>
      <header className="page-header">
        <Container>
          <div className="stack">
            <nav aria-label="Breadcrumb" className="breadcrumb">
              <Link href="/companies">Companies</Link>
            </nav>
            <h1>{company.name}</h1>
            <dl className="stats">
              <div>
                <dt>Experiences</dt>
                <dd>{company.postCount}</dd>
              </div>
              <div>
                <dt>Average difficulty</dt>
                <dd>
                  {company.avgDifficulty !== null ? `${company.avgDifficulty.toFixed(1)} / 5` : "–"}
                </dd>
              </div>
              <div>
                <dt>Common rounds</dt>
                <dd>
                  {rounds.length
                    ? rounds
                        .slice(0, 3)
                        .map(([t, n]) => `${roundLabels[t]} (${n})`)
                        .join(", ")
                    : "–"}
                </dd>
              </div>
              <div>
                <dt>Outcomes</dt>
                <dd>
                  {results.length
                    ? results.map(([t, n]) => `${resultLabels[t]} ${n}`).join(" · ")
                    : "–"}
                </dd>
              </div>
            </dl>
          </div>
        </Container>
      </header>
      <Container>
        <div className="section section--tight stack--lg">
          <FilterBar
            filters={filters}
            reference={reference}
            action={`/companies/${company.slug}`}
            hideCompany
          />
          <ExperienceResults
            page={page}
            filters={filters}
            basePath={`/companies/${company.slug}`}
            showCompany={false}
          />
        </div>
      </Container>
    </>
  );
}

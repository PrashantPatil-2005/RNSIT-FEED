import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { ExperienceResults } from "@/components/experience/ExperienceResults";
import { FilterBar } from "@/components/experience/FilterBar";
import { NotConfigured } from "@/components/ui/NotConfigured";
import { PageHeader } from "@/components/ui/PageHeader";
import { SampleNotice } from "@/components/ui/Sample";
import { hasActiveFilters, parseFilters, type RawSearchParams } from "@/lib/data/filters";
import { getReferenceData, searchExperiences } from "@/lib/data/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Experiences",
  description:
    "Approved placement experiences from RNSIT students and alumni, searchable and filterable.",
};

export default async function ExperiencesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const db = await createSupabaseServerClient();
  if (!db) return <NotConfigured />;
  const filters = parseFilters(await searchParams);
  const reference = await getReferenceData(db);
  const page = await searchExperiences(db, filters, reference);

  return (
    <>
      <PageHeader
        eyebrow="Experiences"
        title={filters.q ? `Results for “${filters.q}”` : "Placement experiences"}
        description="Round-by-round accounts from seniors, reviewed by moderators before they appear."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <SampleNotice />
          <FilterBar filters={filters} reference={reference} action="/experiences" />
          <p className="muted results-summary" aria-live="polite">
            {page.items.length === 0
              ? ""
              : hasActiveFilters(filters)
                ? "Showing matching experiences, best match first."
                : "Showing the latest approved experiences."}
          </p>
          <ExperienceResults page={page} filters={filters} basePath="/experiences" />
        </div>
      </Container>
    </>
  );
}

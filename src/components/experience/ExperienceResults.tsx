import Link from "next/link";
import { StateMessage } from "@/components/ui/StateMessage";
import { filtersToQuery, hasActiveFilters, type ExperienceFilters } from "@/lib/data/filters";
import type { ExperiencePage } from "@/lib/data/queries";
import { ExperienceCard } from "./ExperienceCard";

export function ExperienceResults({
  page,
  filters,
  basePath,
  showCompany = true,
}: {
  page: ExperiencePage;
  filters: ExperienceFilters;
  basePath: string;
  showCompany?: boolean;
}) {
  if (page.items.length === 0) {
    const filtered = hasActiveFilters(filters) || filters.page > 1;
    return (
      <StateMessage
        title={filtered ? "No experiences match these filters" : "No experiences published yet"}
      >
        <p>
          {filtered
            ? "Try removing a filter or searching for a broader term."
            : "Approved experiences will appear here as soon as moderators publish them."}
        </p>
        {filtered ? (
          <p>
            <Link href={basePath}>Clear all filters</Link>
          </p>
        ) : null}
      </StateMessage>
    );
  }
  const prev =
    filters.page > 1
      ? `${basePath}${filtersToQuery({ ...filters, page: filters.page - 1 })}`
      : null;
  const next = page.hasMore
    ? `${basePath}${filtersToQuery({ ...filters, page: filters.page + 1 })}`
    : null;
  return (
    <>
      <h2 id="results-title" className="visually-hidden">
        Results
      </h2>
      <ul className="exp-grid list-reset" aria-labelledby="results-title">
        {page.items.map((exp) => (
          <li key={exp.id}>
            <ExperienceCard exp={exp} showCompany={showCompany} />
          </li>
        ))}
      </ul>
      {prev || next ? (
        <nav className="pagination" aria-label="Pagination">
          {prev ? (
            <Link className="btn btn--secondary btn--small" href={prev} rel="prev">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="pagination__page">Page {filters.page}</span>
          {next ? (
            <Link className="btn btn--secondary btn--small" href={next} rel="next">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}

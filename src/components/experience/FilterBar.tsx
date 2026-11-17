import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { filtersToQuery, type ExperienceFilters } from "@/lib/data/filters";
import { opportunityLabels, resultLabels, roundLabels } from "@/lib/data/labels";
import type { ReferenceData } from "@/lib/data/queries";

type FilterKey = "company" | "dept" | "batch" | "type" | "result" | "round";

/**
 * Plain GET form: works without JavaScript, keeps filters in the URL (shareable, back-button safe),
 * and every control has a visible label. Active filters are highlighted, counted and listed as
 * removable chips, each a link to the same URL without that filter.
 */
export function FilterBar({
  filters,
  reference,
  action,
  hideCompany = false,
}: {
  filters: ExperienceFilters;
  reference: ReferenceData;
  action: string;
  hideCompany?: boolean;
}) {
  const labelFor: Record<FilterKey, (v: string) => string> = {
    company: (v) => reference.companies.find((c) => c.slug === v)?.name ?? v,
    dept: (v) => v,
    batch: (v) => `Batch ${v}`,
    type: (v) => opportunityLabels[v as keyof typeof opportunityLabels] ?? v,
    result: (v) => resultLabels[v as keyof typeof resultLabels] ?? v,
    round: (v) => roundLabels[v as keyof typeof roundLabels] ?? v,
  };
  const keys: FilterKey[] = hideCompany
    ? ["dept", "batch", "type", "result", "round"]
    : ["company", "dept", "batch", "type", "result", "round"];
  const active = keys.filter((k) => filters[k] !== undefined);
  // On a company page the company is part of the page (its URL), not a removable filter.
  const pinned = hideCompany ? { company: undefined } : {};
  const without = (k: FilterKey | "q") =>
    `${action}${filtersToQuery({ ...filters, ...pinned, [k]: undefined, page: 1 })}`;
  const activeCount = active.length + (filters.q ? 1 : 0);

  return (
    <form className="filters" action={action} method="get" aria-labelledby="filters-title">
      <h2 id="filters-title" className="visually-hidden">
        Search and filter
      </h2>
      <div className="filters__search" role="search">
        <label htmlFor="f-q" className="visually-hidden">
          Search experiences
        </label>
        <input
          id="f-q"
          name="q"
          type="search"
          defaultValue={filters.q ?? ""}
          placeholder="Search roles, companies, questions…"
          maxLength={200}
          autoComplete="off"
          className={cn(filters.q && "is-active")}
        />
        <button type="submit" className="btn btn--primary">
          Search
        </button>
      </div>

      <div className="filters__grid">
        {hideCompany ? null : (
          <Select id="f-company" name="company" label="Company" value={filters.company}>
            {reference.companies.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        <Select id="f-dept" name="dept" label="Department" value={filters.dept}>
          {reference.departments.map((d) => (
            <option key={d.id} value={d.code}>
              {d.code} · {d.name}
            </option>
          ))}
        </Select>
        <Select id="f-batch" name="batch" label="Batch" value={filters.batch?.toString()}>
          {reference.batches.map((b) => (
            <option key={b.id} value={b.year}>
              {b.year}
            </option>
          ))}
        </Select>
        <Select id="f-type" name="type" label="Opportunity" value={filters.type}>
          {Object.entries(opportunityLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Select id="f-result" name="result" label="Result" value={filters.result}>
          {Object.entries(resultLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Select id="f-round" name="round" label="Round type" value={filters.round}>
          {Object.entries(roundLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </div>

      <div className="filters__actions">
        <button type="submit" className="btn btn--secondary btn--small">
          Apply filters
        </button>
        <span className="filters__count" aria-live="polite">
          {activeCount === 0
            ? "No filters applied"
            : `${activeCount} filter${activeCount === 1 ? "" : "s"} active`}
        </span>
        {activeCount > 0 ? (
          <Link href={action} className="filters__clear">
            Clear all
          </Link>
        ) : null}
      </div>

      {activeCount > 0 ? (
        <ul className="chips list-reset" aria-label="Active filters">
          {filters.q ? (
            <li>
              <Link
                className="chip"
                href={without("q")}
                aria-label={`Remove search “${filters.q}”`}
              >
                “{filters.q}” <span aria-hidden="true">×</span>
              </Link>
            </li>
          ) : null}
          {active.map((k) => {
            const label = labelFor[k](String(filters[k]));
            return (
              <li key={k}>
                <Link className="chip" href={without(k)} aria-label={`Remove filter ${label}`}>
                  {label} <span aria-hidden="true">×</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </form>
  );
}

function Select({
  id,
  name,
  label,
  value,
  children,
}: {
  id: string;
  name: string;
  label: string;
  value: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={cn("filters__field", value && "is-active")}>
      <label htmlFor={id}>
        {label}
        {value ? <span className="visually-hidden"> (active)</span> : null}
      </label>
      <select id={id} name={name} defaultValue={value ?? ""}>
        <option value="">Any</option>
        {children}
      </select>
    </div>
  );
}

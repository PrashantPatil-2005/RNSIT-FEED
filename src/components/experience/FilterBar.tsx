import Link from "next/link";
import type { ExperienceFilters } from "@/lib/data/filters";
import { opportunityLabels, resultLabels, roundLabels } from "@/lib/data/labels";
import type { ReferenceData } from "@/lib/data/queries";

/**
 * Plain GET form: works without JavaScript, keeps filters in the URL (shareable, back-button safe),
 * and every control has a visible label.
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
  return (
    <form
      className="filters"
      action={action}
      method="get"
      role="search"
      aria-label="Search and filter experiences"
    >
      <div className="filters__search">
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
        <Link href={action} className="filters__clear">
          Clear all
        </Link>
      </div>
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
  children: React.ReactNode;
}) {
  return (
    <div className="filters__field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} defaultValue={value ?? ""}>
        <option value="">Any</option>
        {children}
      </select>
    </div>
  );
}

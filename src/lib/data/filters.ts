import { isKey, opportunityLabels, resultLabels, roundLabels } from "./labels";
import type { OpportunityType, ResultType, RoundType } from "./labels";

/**
 * Parses untrusted URL search parameters into a strictly typed filter. Anything malformed is
 * dropped, never passed through. The database validates again on its side.
 */
export interface ExperienceFilters {
  q?: string;
  company?: string; // company slug
  dept?: string; // department code, e.g. CS
  batch?: number; // graduation year
  type?: OpportunityType;
  result?: ResultType;
  round?: RoundType;
  page: number;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const PAGE_SIZE = 12;
const MAX_PAGE = 50;

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseFilters(params: RawSearchParams): ExperienceFilters {
  const q = first(params.q)?.slice(0, 200);
  const company = first(params.company);
  const dept = first(params.dept)?.toUpperCase();
  const batch = Number(first(params.batch));
  const page = Number(first(params.page));
  return {
    q,
    company: company && /^[a-z0-9-]{1,80}$/.test(company) ? company : undefined,
    dept: dept && /^[A-Z]{2}$/.test(dept) ? dept : undefined,
    batch: Number.isInteger(batch) && batch >= 2000 && batch <= 2100 ? batch : undefined,
    type: isKey(opportunityLabels, first(params.type))
      ? (first(params.type) as OpportunityType)
      : undefined,
    result: isKey(resultLabels, first(params.result))
      ? (first(params.result) as ResultType)
      : undefined,
    round: isKey(roundLabels, first(params.round)) ? (first(params.round) as RoundType) : undefined,
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/** Builds a query string from filters, omitting empty values (and page 1). */
export function filtersToQuery(filters: Partial<ExperienceFilters>): string {
  const sp = new URLSearchParams();
  for (const key of ["q", "company", "dept", "batch", "type", "result", "round"] as const) {
    const v = filters[key];
    if (v !== undefined && v !== "") sp.set(key, String(v));
  }
  if (filters.page && filters.page > 1) sp.set("page", String(filters.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function hasActiveFilters(f: ExperienceFilters): boolean {
  return Boolean(f.q || f.company || f.dept || f.batch || f.type || f.result || f.round);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

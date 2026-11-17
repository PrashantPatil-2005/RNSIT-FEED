import "server-only";
import type { DbClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { PAGE_SIZE, type ExperienceFilters } from "./filters";
import type { CampusType, OpportunityType, ResultType, RoundType } from "./labels";

/**
 * Read-side queries for public pages. Every query goes through the public views or the
 * search_experiences function, which only ever return APPROVED content with anonymous authors
 * masked by the database. Nothing here can widen what a visitor sees.
 */

export class DataError extends Error {
  constructor(context: string, cause: { message: string; code?: string }) {
    // The database message is logged on the server only; pages show a generic error.
    super(`${context}: ${cause.code ?? ""} ${cause.message}`.trim());
    this.name = "DataError";
  }
}

export interface ExperienceSummary {
  id: string;
  companyName: string;
  companySlug: string;
  roleTitle: string;
  opportunityType: OpportunityType;
  campusType: CampusType;
  departmentCode: string;
  batchYear: number;
  recruitmentYear: number;
  result: ResultType;
  publishedOn: string;
  authorName: string | null; // null = anonymous
  helpfulCount?: number;
}

export interface ReferenceData {
  departments: { id: number; code: string; name: string }[];
  batches: { id: number; year: number }[];
  companies: { id: string; name: string; slug: string }[];
  topics: { id: number; slug: string; name: string }[];
}

export async function getReferenceData(db: DbClient): Promise<ReferenceData> {
  const [d, b, c, t] = await Promise.all([
    db.from("departments").select("id, code, name, active").order("code"),
    db.from("batches").select("id, grad_year").order("grad_year", { ascending: false }),
    db.from("companies").select("id, name, slug").order("name"),
    db.from("topics").select("id, slug, name").order("name"),
  ]);
  if (d.error) throw new DataError("departments", d.error);
  if (b.error) throw new DataError("batches", b.error);
  if (c.error) throw new DataError("companies", c.error);
  if (t.error) throw new DataError("topics", t.error);
  return {
    departments: d.data.filter((x) => x.active).map(({ id, code, name }) => ({ id, code, name })),
    batches: b.data.map((x) => ({ id: x.id, year: x.grad_year })),
    companies: c.data,
    topics: t.data,
  };
}

export interface ExperiencePage {
  items: ExperienceSummary[];
  hasMore: boolean;
  /** True when a filter value (company, department, batch) does not exist: no results by definition. */
  unknownFilter: boolean;
}

export async function searchExperiences(
  db: DbClient,
  filters: ExperienceFilters,
  ref: ReferenceData,
  pageSize: number = PAGE_SIZE,
): Promise<ExperiencePage> {
  const companyId = filters.company
    ? ref.companies.find((c) => c.slug === filters.company)?.id
    : undefined;
  const departmentId = filters.dept
    ? ref.departments.find((d) => d.code === filters.dept)?.id
    : undefined;
  const batchId = filters.batch ? ref.batches.find((b) => b.year === filters.batch)?.id : undefined;
  if (
    (filters.company && !companyId) ||
    (filters.dept && !departmentId) ||
    (filters.batch && !batchId)
  ) {
    return { items: [], hasMore: false, unknownFilter: true };
  }

  const { data, error } = await db.rpc("search_experiences", {
    p_query: filters.q,
    p_company_id: companyId,
    p_department_id: departmentId,
    p_batch_id: batchId,
    p_opportunity: filters.type,
    p_result: filters.result,
    p_round_type: filters.round,
    p_limit: pageSize + 1, // one extra row tells us whether there is a next page
    p_offset: (filters.page - 1) * pageSize,
  });
  if (error) throw new DataError("search_experiences", error);
  const rows = data ?? [];
  return {
    items: rows.slice(0, pageSize).map((r) => ({
      id: r.id,
      companyName: r.company_name,
      companySlug: r.company_slug,
      roleTitle: r.role_title,
      opportunityType: r.opportunity_type,
      campusType: r.campus_type,
      departmentCode: r.department_code,
      batchYear: r.batch_year,
      recruitmentYear: r.recruitment_year,
      result: r.result,
      publishedOn: r.published_on,
      authorName: r.is_anonymous ? null : r.author_name,
    })),
    hasMore: rows.length > pageSize,
    unknownFilter: false,
  };
}

/** Approved experiences with at least one helpful vote, most helpful first. */
export async function listMostHelpful(db: DbClient, limit: number): Promise<ExperienceSummary[]> {
  const top = await db
    .from("public_engagement")
    .select("experience_id, helpful_count")
    .gt("helpful_count", 0)
    .order("helpful_count", { ascending: false })
    .limit(limit);
  if (top.error) throw new DataError("public_engagement", top.error);
  if (!top.data.length) return [];
  const exps = await db
    .from("public_experiences")
    .select("*")
    .in(
      "id",
      top.data.map((t) => t.experience_id),
    );
  if (exps.error) throw new DataError("public_experiences", exps.error);
  const byId = new Map(exps.data.map((e) => [e.id, e]));
  return top.data.flatMap((t): ExperienceSummary[] => {
    const e = byId.get(t.experience_id);
    if (
      !e ||
      !e.opportunity_type ||
      !e.campus_type ||
      !e.result ||
      !e.role_title ||
      !e.recruitment_year
    )
      return [];
    return [
      {
        id: e.id,
        companyName: e.company_name,
        companySlug: e.company_slug,
        roleTitle: e.role_title,
        opportunityType: e.opportunity_type,
        campusType: e.campus_type,
        departmentCode: e.department_code,
        batchYear: e.batch_year,
        recruitmentYear: e.recruitment_year,
        result: e.result,
        publishedOn: e.published_on ?? "",
        authorName: e.is_anonymous === false ? e.author_name : null,
        helpfulCount: t.helpful_count ?? 0,
      },
    ];
  });
}

export interface Round {
  id: string;
  position: number;
  roundType: RoundType;
  durationMin: number | null;
  platform: string | null;
  difficulty: number | null;
  notes: string | null;
  topics: string[];
  questions: { id: string; body: string; topics: string[] }[];
}

export interface ExperienceDetail extends ExperienceSummary {
  departmentName: string;
  minCgpa: number | null;
  backlogsAllowed: number | null;
  eligibleDepartments: string[];
  prepTips: string | null;
  rounds: Round[];
  resources: { url: string; label: string | null }[];
  helpfulCount: number;
  comments: {
    id: string;
    body: string;
    authorName: string | null;
    byPostAuthor: boolean;
    isMine: boolean;
    postedOn: string;
  }[];
}

/** Returns null when the experience does not exist or is not approved (indistinguishable on purpose). */
export async function getExperience(db: DbClient, id: string): Promise<ExperienceDetail | null> {
  const exp = await db.from("public_experiences").select("*").eq("id", id).maybeSingle();
  if (exp.error) throw new DataError("public_experiences", exp.error);
  const e = exp.data;
  if (
    !e ||
    !e.opportunity_type ||
    !e.campus_type ||
    !e.result ||
    !e.role_title ||
    !e.recruitment_year
  )
    return null;

  const [rounds, questions, resources, eligible, engagement, comments] = await Promise.all([
    db.from("public_rounds").select("*").eq("experience_id", id).order("position"),
    db.from("public_questions").select("*").eq("experience_id", id).order("position"),
    db.from("public_resources").select("*").eq("experience_id", id).order("position"),
    db.from("public_eligible_departments").select("department_code").eq("experience_id", id),
    db.from("public_engagement").select("helpful_count").eq("experience_id", id).maybeSingle(),
    db
      .from("public_comments")
      .select("id, body, author_name, by_post_author, is_mine, posted_on, seq")
      .eq("experience_id", id)
      .order("seq"),
  ]);
  for (const [name, r] of [
    ["public_rounds", rounds],
    ["public_questions", questions],
    ["public_resources", resources],
    ["public_eligible_departments", eligible],
    ["public_engagement", engagement],
    ["public_comments", comments],
  ] as const) {
    if (r.error) throw new DataError(name, r.error);
  }

  return {
    id: e.id,
    companyName: e.company_name,
    companySlug: e.company_slug,
    roleTitle: e.role_title,
    opportunityType: e.opportunity_type,
    campusType: e.campus_type,
    departmentCode: e.department_code,
    departmentName: e.department_name,
    batchYear: e.batch_year,
    recruitmentYear: e.recruitment_year,
    result: e.result,
    publishedOn: e.published_on ?? "",
    authorName: e.is_anonymous === false ? e.author_name : null,
    minCgpa: e.min_cgpa,
    backlogsAllowed: e.backlogs_allowed,
    eligibleDepartments: (eligible.data ?? []).map((x) => x.department_code).sort(),
    prepTips: e.prep_tips,
    rounds: (rounds.data ?? []).map((r) => ({
      id: r.id,
      position: r.position,
      roundType: r.round_type,
      durationMin: r.duration_min,
      platform: r.platform,
      difficulty: r.difficulty,
      notes: r.notes,
      topics: r.topics ?? [],
      questions: (questions.data ?? [])
        .filter((q) => q.round_id === r.id)
        .map((q) => ({ id: q.id, body: q.body, topics: q.topics ?? [] })),
    })),
    resources: (resources.data ?? [])
      .filter((x) => /^https?:\/\//i.test(x.url))
      .map((x) => ({ url: x.url, label: x.label })),
    helpfulCount: engagement.data?.helpful_count ?? 0,
    comments: (comments.data ?? []).map((c) => ({
      id: c.id,
      body: c.body,
      authorName: c.author_name,
      byPostAuthor: c.by_post_author ?? false,
      isMine: c.is_mine ?? false,
      postedOn: c.posted_on ?? "",
    })),
  };
}

export interface CompanyStats {
  id: string;
  name: string;
  slug: string;
  postCount: number;
  avgDifficulty: number | null;
  roundTypeCounts: Partial<Record<RoundType, number>>;
  resultCounts: Partial<Record<ResultType, number>>;
}

function countMap<K extends string>(json: Json | null): Partial<Record<K, number>> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: Partial<Record<K, number>> = {};
  for (const [k, v] of Object.entries(json)) if (typeof v === "number") out[k as K] = v;
  return out;
}

/** All companies, with stats for those that have approved posts. Sorted by post count, then name. */
export async function listCompanies(db: DbClient): Promise<CompanyStats[]> {
  const [companies, stats] = await Promise.all([
    db.from("companies").select("id, name, slug").order("name"),
    db.from("company_stats").select("*"),
  ]);
  if (companies.error) throw new DataError("companies", companies.error);
  if (stats.error) throw new DataError("company_stats", stats.error);
  const byId = new Map(stats.data.map((s) => [s.company_id, s]));
  return companies.data
    .map((c) => {
      const s = byId.get(c.id);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        postCount: s?.post_count ?? 0,
        avgDifficulty: s?.avg_difficulty ?? null,
        roundTypeCounts: countMap<RoundType>(s?.round_type_counts ?? null),
        resultCounts: countMap<ResultType>(s?.result_counts ?? null),
      };
    })
    .sort((a, b) => b.postCount - a.postCount || a.name.localeCompare(b.name));
}

export async function getCompany(db: DbClient, slug: string): Promise<CompanyStats | null> {
  const company = await db
    .from("companies")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (company.error) throw new DataError("companies", company.error);
  if (!company.data) return null;
  const stats = await db
    .from("company_stats")
    .select("*")
    .eq("company_id", company.data.id)
    .maybeSingle();
  if (stats.error) throw new DataError("company_stats", stats.error);
  const s = stats.data;
  return {
    ...company.data,
    postCount: s?.post_count ?? 0,
    avgDifficulty: s?.avg_difficulty ?? null,
    roundTypeCounts: countMap<RoundType>(s?.round_type_counts ?? null),
    resultCounts: countMap<ResultType>(s?.result_counts ?? null),
  };
}

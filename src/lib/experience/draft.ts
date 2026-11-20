/**
 * Experience draft model shared by the client form and the server actions.
 *
 * - `normalizeForm` coerces UNTRUSTED input into a well-formed DraftForm (types, lengths, counts).
 *   The server runs it on everything the browser sends; nothing else from the request is used.
 * - `toPayload` builds the exact save_draft payload. Autosave stores only what is already valid
 *   (the database rejects partial rows such as a 4-character question) and reports the rest as
 *   "not saved yet", so a half-typed item never makes the whole save fail.
 * - `validateForSubmit` lists everything that must be fixed before submitting. The database checks
 *   completeness again in submit_experience.
 */

export const OPPORTUNITY = ["internship", "full_time", "both"] as const;
export const CAMPUS = ["on_campus", "off_campus"] as const;
export const RESULT = ["selected", "rejected", "waitlisted"] as const;
export const ROUND_TYPES = ["oa", "technical", "hr", "gd", "managerial"] as const;

export const LIMITS = {
  companyMax: 120,
  roleMin: 2,
  roleMax: 120,
  rounds: 12,
  questionsPerRound: 20,
  questionMin: 10,
  questionMax: 2000,
  notesMax: 2000,
  platformMax: 120,
  tipsMax: 5000,
  resources: 10,
  urlMax: 2048,
  labelMax: 120,
  durationMax: 600,
  backlogsMax: 50,
  yearMin: 2000,
  yearMax: 2100,
} as const;

export interface QuestionForm {
  key: string;
  body: string;
}
export interface RoundForm {
  key: string;
  roundType: string;
  durationMin: string;
  platform: string;
  difficulty: string;
  notes: string;
  topicIds: number[];
  questions: QuestionForm[];
}
export interface ResourceForm {
  key: string;
  url: string;
  label: string;
}
export interface DraftForm {
  /** Typed company name. Matches an existing company or alias, else a new one is created at submit. */
  companyName: string;
  roleTitle: string;
  opportunityType: string;
  campusType: string;
  recruitmentYear: string;
  minCgpa: string;
  backlogsAllowed: string;
  eligibleDepartmentIds: number[];
  result: string;
  prepTips: string;
  /** "" = not chosen yet (no default, decision O-5), "yes" = anonymous, "no" = named. */
  anonymity: "" | "yes" | "no";
  rounds: RoundForm[];
  resources: ResourceForm[];
}

const URL_RE = /^https?:\/\/[^\s]+$/i;

let keySeq = 0;
export function newKey(): string {
  keySeq += 1;
  return `k${Date.now().toString(36)}${keySeq}`;
}

export function emptyQuestion(): QuestionForm {
  return { key: newKey(), body: "" };
}
export function emptyRound(): RoundForm {
  return {
    key: newKey(),
    roundType: "",
    durationMin: "",
    platform: "",
    difficulty: "",
    notes: "",
    topicIds: [],
    questions: [emptyQuestion()],
  };
}
export function emptyForm(): DraftForm {
  return {
    companyName: "",
    roleTitle: "",
    opportunityType: "",
    campusType: "",
    recruitmentYear: "",
    minCgpa: "",
    backlogsAllowed: "",
    eligibleDepartmentIds: [],
    result: "",
    prepTips: "",
    anonymity: "",
    rounds: [emptyRound()],
    resources: [],
  };
}

// ---------- Untrusted input -> DraftForm ----------

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const oneOf = (v: unknown, allowed: readonly string[]): string =>
  typeof v === "string" && allowed.includes(v) ? v : "";
const ids = (v: unknown, max: number): number[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is number => Number.isInteger(x) && x > 0 && x < 32768))].slice(
        0,
        max,
      )
    : [];
const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function normalizeForm(input: unknown): DraftForm {
  const f = obj(input);
  return {
    companyName: str(f.companyName, LIMITS.companyMax),
    roleTitle: str(f.roleTitle, LIMITS.roleMax),
    opportunityType: oneOf(f.opportunityType, OPPORTUNITY),
    campusType: oneOf(f.campusType, CAMPUS),
    recruitmentYear: str(f.recruitmentYear, 4),
    minCgpa: str(f.minCgpa, 5),
    backlogsAllowed: str(f.backlogsAllowed, 3),
    eligibleDepartmentIds: ids(f.eligibleDepartmentIds, 40),
    result: oneOf(f.result, RESULT),
    prepTips: str(f.prepTips, LIMITS.tipsMax),
    anonymity: f.anonymity === "yes" || f.anonymity === "no" ? f.anonymity : "",
    rounds: arr(f.rounds, LIMITS.rounds).map((r) => {
      const x = obj(r);
      return {
        key: str(x.key, 40) || newKey(),
        roundType: oneOf(x.roundType, ROUND_TYPES),
        durationMin: str(x.durationMin, 3),
        platform: str(x.platform, LIMITS.platformMax),
        difficulty: oneOf(x.difficulty, ["1", "2", "3", "4", "5"]),
        notes: str(x.notes, LIMITS.notesMax),
        topicIds: ids(x.topicIds, 20),
        questions: arr(x.questions, LIMITS.questionsPerRound).map((q) => {
          const y = obj(q);
          return { key: str(y.key, 40) || newKey(), body: str(y.body, LIMITS.questionMax) };
        }),
      };
    }),
    resources: arr(f.resources, LIMITS.resources).map((r) => {
      const x = obj(r);
      return {
        key: str(x.key, 40) || newKey(),
        url: str(x.url, LIMITS.urlMax),
        label: str(x.label, LIMITS.labelMax),
      };
    }),
  };
}

// ---------- DraftForm -> save_draft payload ----------

function intIn(v: string, min: number, max: number): number | null {
  const t = v.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}
function cgpa(v: string): number | null {
  const t = v.trim();
  if (!/^\d{1,2}(\.\d)?$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= 10 ? n : null;
}

export interface PayloadResult {
  payload: Record<string, unknown>;
  /** Human-readable items that are typed but not valid yet, so they were not saved. */
  notSaved: string[];
}

export function toPayload(form: DraftForm): PayloadResult {
  const notSaved: string[] = [];
  const role = form.roleTitle.trim();
  if (role.length > 0 && role.length < LIMITS.roleMin) notSaved.push("Role title (too short)");
  const year = intIn(form.recruitmentYear, LIMITS.yearMin, LIMITS.yearMax);
  if (form.recruitmentYear.trim() && year === null) notSaved.push("Recruitment year");
  const minCgpa = cgpa(form.minCgpa);
  if (form.minCgpa.trim() && minCgpa === null) notSaved.push("Minimum CGPA");
  const backlogs = intIn(form.backlogsAllowed, 0, LIMITS.backlogsMax);
  if (form.backlogsAllowed.trim() && backlogs === null) notSaved.push("Backlogs allowed");

  const rounds = form.rounds.flatMap((r, i) => {
    const label = `Round ${i + 1}`;
    if (!r.roundType) {
      const hasContent =
        r.questions.some((q) => q.body.trim()) || r.platform.trim() || r.notes.trim();
      if (hasContent) notSaved.push(`${label} (choose a round type)`);
      return [];
    }
    const duration = intIn(r.durationMin, 1, LIMITS.durationMax);
    if (r.durationMin.trim() && duration === null) notSaved.push(`${label} duration`);
    const questions = r.questions.flatMap((q, j) => {
      const body = q.body.trim();
      if (!body) return [];
      if (body.length < LIMITS.questionMin) {
        notSaved.push(`${label}, question ${j + 1} (at least ${LIMITS.questionMin} characters)`);
        return [];
      }
      return [{ body }];
    });
    return [
      {
        round_type: r.roundType,
        duration_min: duration,
        platform: r.platform.trim() || null,
        difficulty: r.difficulty ? Number(r.difficulty) : null,
        notes: r.notes.trim() || null,
        topic_ids: r.topicIds,
        questions,
      },
    ];
  });

  const resources = form.resources.flatMap((r, i) => {
    const url = r.url.trim();
    if (!url) return [];
    if (!URL_RE.test(url)) {
      notSaved.push(`Link ${i + 1} (must start with http:// or https://)`);
      return [];
    }
    return [{ url, label: r.label.trim() || null }];
  });

  return {
    payload: {
      company_name: form.companyName.trim().replace(/\s+/g, " ") || null,
      role_title: role.length >= LIMITS.roleMin ? role : null,
      opportunity_type: form.opportunityType || null,
      campus_type: form.campusType || null,
      recruitment_year: year,
      min_cgpa: minCgpa,
      backlogs_allowed: backlogs,
      eligible_department_ids: form.eligibleDepartmentIds,
      result: form.result || null,
      prep_tips: form.prepTips.trim() || null,
      is_anonymous: form.anonymity === "" ? null : form.anonymity === "yes",
      rounds,
      resources,
    },
    notSaved,
  };
}

// ---------- Submit validation ----------

export interface SubmitIssue {
  field: string;
  message: string;
}

export function validateForSubmit(form: DraftForm): SubmitIssue[] {
  const issues: SubmitIssue[] = [];
  const role = form.roleTitle.trim();
  if (!form.companyName.trim())
    issues.push({ field: "companyName", message: "Enter the company name." });
  if (role.length < LIMITS.roleMin)
    issues.push({ field: "roleTitle", message: "Enter the role title." });
  if (!form.opportunityType)
    issues.push({ field: "opportunityType", message: "Choose the opportunity type." });
  if (!form.campusType) issues.push({ field: "campusType", message: "Choose on- or off-campus." });
  if (intIn(form.recruitmentYear, LIMITS.yearMin, LIMITS.yearMax) === null)
    issues.push({ field: "recruitmentYear", message: "Enter the recruitment year." });
  if (!form.result) issues.push({ field: "result", message: "Choose the final result." });
  if (!form.anonymity)
    issues.push({
      field: "anonymity",
      message: "Choose whether to post under your name or anonymously.",
    });
  if (form.rounds.length === 0)
    issues.push({ field: "rounds", message: "Add at least one interview round." });
  const { notSaved } = toPayload(form);
  for (const n of notSaved) issues.push({ field: "notSaved", message: `Fix or remove: ${n}.` });
  const hasQuestion = form.rounds.some(
    (r) => r.roundType && r.questions.some((q) => q.body.trim().length >= LIMITS.questionMin),
  );
  if (!hasQuestion)
    issues.push({ field: "rounds", message: "Add at least one question, in your own words." });
  form.rounds.forEach((r, i) => {
    if (!r.roundType)
      issues.push({ field: `round-${i}`, message: `Round ${i + 1}: choose the round type.` });
  });
  return issues;
}

// ---------- get_my_experience JSON -> DraftForm ----------

export function fromExperienceJson(json: unknown): DraftForm {
  const j = obj(json);
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return normalizeForm({
    companyName: s(j.company_name),
    roleTitle: s(j.role_title),
    opportunityType: s(j.opportunity_type),
    campusType: s(j.campus_type),
    recruitmentYear: s(j.recruitment_year),
    minCgpa: s(j.min_cgpa),
    backlogsAllowed: s(j.backlogs_allowed),
    eligibleDepartmentIds: arr(j.eligible_department_ids, 40),
    result: s(j.result),
    prepTips: s(j.prep_tips),
    anonymity: j.is_anonymous === true ? "yes" : j.is_anonymous === false ? "no" : "",
    rounds: arr(j.rounds, LIMITS.rounds).map((r) => {
      const x = obj(r);
      const qs = arr(x.questions, LIMITS.questionsPerRound).map((q) => ({
        key: newKey(),
        body: s(obj(q).body),
      }));
      return {
        key: newKey(),
        roundType: s(x.round_type),
        durationMin: s(x.duration_min),
        platform: s(x.platform),
        difficulty: s(x.difficulty),
        notes: s(x.notes),
        topicIds: arr(x.topic_ids, 20),
        questions: qs.length ? qs : [emptyQuestion()],
      };
    }),
    resources: arr(j.resources, LIMITS.resources).map((r) => ({
      key: newKey(),
      url: s(obj(r).url),
      label: s(obj(r).label),
    })),
  });
}

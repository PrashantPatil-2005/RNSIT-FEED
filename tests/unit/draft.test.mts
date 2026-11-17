// Unit tests for the draft model (node --test; Node strips the TypeScript types).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyForm,
  emptyRound,
  fromExperienceJson,
  normalizeForm,
  toPayload,
  validateForSubmit,
  type DraftForm,
} from "../../src/lib/experience/draft.ts";

const UUID = "a0000000-0000-4000-8000-000000000001";

function complete(): DraftForm {
  const f = emptyForm();
  f.companyId = UUID;
  f.roleTitle = "Software Engineer";
  f.opportunityType = "full_time";
  f.campusType = "on_campus";
  f.recruitmentYear = "2026";
  f.result = "selected";
  f.anonymity = "yes";
  f.rounds = [
    {
      ...emptyRound(),
      roundType: "technical",
      questions: [{ key: "q", body: "Explain hash map collisions" }],
    },
  ];
  return f;
}

test("normalizeForm drops unknown keys and coerces hostile input", () => {
  const f = normalizeForm({
    companyId: "not-a-uuid",
    roleTitle: "x".repeat(500),
    opportunityType: "admin",
    status: "approved",
    is_anonymous: true,
    anonymity: "maybe",
    eligibleDepartmentIds: [1, 1, "2", -3, 99999, 2.5, 4],
    rounds: Array.from({ length: 50 }, () => ({
      roundType: "oa",
      difficulty: "9",
      questions: "nope",
    })),
    resources: [{ url: 42 }],
  });
  assert.equal(f.companyId, "");
  assert.equal(f.roleTitle.length, 120);
  assert.equal(f.opportunityType, "");
  assert.equal(f.anonymity, "");
  assert.deepEqual(f.eligibleDepartmentIds, [1, 4]);
  assert.equal(f.rounds.length, 12);
  assert.equal(f.rounds[0]!.difficulty, "");
  assert.deepEqual(f.rounds[0]!.questions, []);
  assert.equal(f.resources[0]!.url, "");
  assert.equal("status" in f, false);
});

test("normalizeForm tolerates non-objects", () => {
  for (const v of [null, undefined, 42, "x", [], true]) {
    assert.deepEqual(normalizeForm(v).rounds, []);
  }
});

test("toPayload only sends whitelisted keys and keeps anonymity unset until chosen", () => {
  const { payload } = toPayload(emptyForm());
  assert.deepEqual(Object.keys(payload).sort(), [
    "backlogs_allowed",
    "campus_type",
    "company_id",
    "eligible_department_ids",
    "is_anonymous",
    "min_cgpa",
    "opportunity_type",
    "prep_tips",
    "recruitment_year",
    "resources",
    "result",
    "role_title",
    "rounds",
  ]);
  assert.equal(payload.is_anonymous, null);
  assert.equal(toPayload({ ...emptyForm(), anonymity: "no" }).payload.is_anonymous, false);
  assert.equal(toPayload({ ...emptyForm(), anonymity: "yes" }).payload.is_anonymous, true);
});

test("toPayload saves valid parts and reports what is not saved yet", () => {
  const f = emptyForm();
  f.roleTitle = "A";
  f.recruitmentYear = "1999";
  f.minCgpa = "10.55";
  f.rounds = [
    { ...emptyRound(), roundType: "", questions: [{ key: "a", body: "typed but no type yet" }] },
    {
      ...emptyRound(),
      roundType: "oa",
      durationMin: "9999",
      questions: [
        { key: "b", body: "short" },
        { key: "c", body: "A long enough question" },
      ],
    },
  ];
  f.resources = [
    { key: "r", url: "javascript:alert(1)", label: "" },
    { key: "s", url: "https://ok.example", label: " x " },
  ];
  const { payload, notSaved } = toPayload(f);
  assert.equal(payload.role_title, null);
  assert.equal(payload.recruitment_year, null);
  assert.equal(payload.min_cgpa, null);
  const rounds = payload.rounds as {
    round_type: string;
    duration_min: unknown;
    questions: { body: string }[];
  }[];
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0]!.duration_min, null);
  assert.deepEqual(rounds[0]!.questions, [{ body: "A long enough question" }]);
  assert.deepEqual(payload.resources, [{ url: "https://ok.example", label: "x" }]);
  for (const part of [
    "Role title",
    "Recruitment year",
    "Minimum CGPA",
    "Round 1 (choose",
    "Round 2 duration",
    "Round 2, question 1",
    "Link 1",
  ]) {
    assert.ok(
      notSaved.some((n) => n.startsWith(part)),
      `expected not-saved entry for ${part}: ${notSaved.join(" | ")}`,
    );
  }
});

test("validateForSubmit requires every mandatory field, including an explicit anonymity choice", () => {
  assert.deepEqual(validateForSubmit(complete()), []);
  const f = { ...complete(), anonymity: "" as const };
  assert.ok(validateForSubmit(f).some((i) => i.field === "anonymity"));
  const g = { ...complete(), rounds: [] };
  assert.ok(validateForSubmit(g).some((i) => i.field === "rounds"));
  const h = complete();
  h.rounds[0]!.questions = [{ key: "q", body: "too short" }];
  assert.ok(validateForSubmit(h).length > 0);
  const e = validateForSubmit(emptyForm()).map((i) => i.field);
  for (const k of [
    "companyId",
    "roleTitle",
    "opportunityType",
    "campusType",
    "recruitmentYear",
    "result",
    "anonymity",
  ]) {
    assert.ok(e.includes(k), `missing ${k}`);
  }
});

test("fromExperienceJson round-trips through toPayload", () => {
  const json = {
    company_id: UUID,
    role_title: "SDE",
    opportunity_type: "both",
    campus_type: "off_campus",
    recruitment_year: 2025,
    min_cgpa: 7.5,
    backlogs_allowed: 0,
    result: "waitlisted",
    prep_tips: "tips",
    is_anonymous: false,
    eligible_department_ids: [1, 2],
    resources: [{ url: "https://a.example", label: null }],
    rounds: [
      {
        round_type: "hr",
        duration_min: 20,
        platform: null,
        difficulty: 2,
        notes: null,
        topic_ids: [3],
        questions: [{ body: "Why do you want to join?", topic_ids: [] }],
      },
    ],
  };
  const f = fromExperienceJson(json);
  assert.equal(f.anonymity, "no");
  assert.equal(f.minCgpa, "7.5");
  const p = toPayload(f).payload;
  assert.equal(p.recruitment_year, 2025);
  assert.equal(p.backlogs_allowed, 0);
  assert.equal(p.is_anonymous, false);
  assert.deepEqual(p.eligible_department_ids, [1, 2]);
  assert.equal((p.rounds as { difficulty: number }[])[0]!.difficulty, 2);
  assert.equal(fromExperienceJson({ is_anonymous: null }).anonymity, "");
});

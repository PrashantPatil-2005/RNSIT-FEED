// HTTP-level checks against the REAL LOCAL Supabase stack: PostgREST exposure, the Auth sign-up
// guard (hook + trigger), JWT -> auth.uid() mapping, and authenticated access through the Data API.
//
// Safety: reads URLs and keys from `npx supabase status -o env` and refuses to run unless the API
// URL is on 127.0.0.1 or localhost. It never contacts a hosted project.
//
// Precondition: `node supabase/tests/run-supabase.mjs` has run (it resets the DB and loads the
// synthetic seed, which sets the development sign-up domain to example.test).
//
// Usage: node supabase/tests/api/run-api.mjs

import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split(/\r?\n/)
    .map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const API = env.API_URL;
const host = new URL(API).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error(`Refusing to run: API_URL is not local (${host}).`);
  process.exit(2);
}
const ANON = env.ANON_KEY;
const SERVICE = env.SERVICE_ROLE_KEY;

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n      ${detail}`}`);
}

async function call(path, { method = "GET", key = ANON, token, body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

const denied = (r) => r.status === 401 || r.status === 403 || r.status === 404 || r.status === 406;
const short = (r) => `${r.status} ${JSON.stringify(r.json).slice(0, 160)}`;

// ---------- 1. PostgREST, anonymous visitor ----------
{
  const r = await call("/rest/v1/public_experiences?select=*&limit=1");
  record("anon can read public_experiences", r.status === 200, short(r));
}
for (const v of [
  "public_rounds",
  "public_questions",
  "public_resources",
  "company_stats",
  "public_comments",
  "public_engagement",
  "companies",
  "departments",
]) {
  const r = await call(`/rest/v1/${v}?select=*&limit=1`);
  record(`anon can read ${v}`, r.status === 200, short(r));
}
for (const t of [
  "experiences",
  "rounds",
  "questions",
  "reports",
  "moderation_actions",
  "profiles",
  "comments",
  "experience_votes",
  "comment_reports",
  "my_experiences",
  "moderation_reports",
  "moderation_comments",
]) {
  const r = await call(`/rest/v1/${t}?select=*&limit=1`);
  record(`anon is denied ${t}`, denied(r), short(r));
}
{
  const r = await call("/rest/v1/profile_private?select=*");
  record("private schema tables are not exposed (default profile)", denied(r), short(r));
  const r2 = await call("/rest/v1/profile_private?select=*", {
    headers: { "Accept-Profile": "private" },
  });
  record("private schema cannot be selected via Accept-Profile", denied(r2), short(r2));
  const r3 = await call("/rest/v1/settings?select=*", { headers: { "Accept-Profile": "private" } });
  record("private.settings unreachable", denied(r3), short(r3));
}
{
  const r = await call("/rest/v1/rpc/search_experiences", {
    method: "POST",
    body: { p_query: "test" },
  });
  record("anon can call search_experiences", r.status === 200, short(r));
}
for (const [fn, body] of [
  ["add_comment", { p_experience: randomUUID(), p_body: "anonymous visitor" }],
  ["set_helpful_vote", { p_experience: randomUUID(), p_helpful: true }],
  ["save_draft", { p_id: null, p_expected_version: null, p_payload: {} }],
  ["moderate_experience", { p_id: randomUUID(), p_action: "approve" }],
  [
    "admin_set_user_role",
    { p_user: randomUUID(), p_role: "admin", p_reason: "attempted escalation" },
  ],
  ["delete_account_data", { p_user: randomUUID() }],
  ["purge_expired_drafts", { p_days: 1 }],
  ["hook_before_user_created", { event: { user: { email: "a@example.test" } } }],
]) {
  const r = await call(`/rest/v1/rpc/${fn}`, { method: "POST", body });
  record(`anon cannot call ${fn}`, denied(r), short(r));
}
{
  const r = await call("/rest/v1/comments", {
    method: "POST",
    body: { experience_id: randomUUID(), author_id: randomUUID(), body: "direct insert" },
  });
  record("anon cannot insert comments directly", denied(r), short(r));
  const r2 = await call("/rest/v1/companies", {
    method: "POST",
    body: { name: "Injected Co", slug: "injected-co" },
  });
  record("anon cannot insert companies directly", denied(r2), short(r2));
}
{
  const r = await call("/graphql/v1", {
    method: "POST",
    body: { query: "{ experiencesCollection { edges { node { id } } } }" },
  });
  const leaked = JSON.stringify(r.json).includes('"node"');
  record("GraphQL does not expose experiences to anon", !leaked, short(r));
}

// ---------- 2. Auth: sign-up guard ----------
const pw = `Synthetic-${randomUUID()}`;
{
  const r = await call("/auth/v1/signup", {
    method: "POST",
    body: { email: `outsider.${Date.now()}@gmail.com`, password: pw },
  });
  record("signup from another domain is refused", r.status >= 400, short(r));
  const viaHook = JSON.stringify(r.json).includes("not allowed for this email");
  record(
    "refusal comes from the before-user-created hook (payload shape verified)",
    viaHook,
    short(r),
  );
}
{
  // Email/password sign-up on the allowed domain: Google has not verified the address, so the
  // guard must refuse it (only verified Google identities may join).
  const r = await call("/auth/v1/signup", {
    method: "POST",
    body: { email: `unverified.${Date.now()}@example.test`, password: pw },
  });
  record("signup on allowed domain WITHOUT a verified email is refused", r.status >= 400, short(r));
}
{
  // Service-role admin creation bypasses the hook; the auth.users trigger must still refuse.
  const r = await call("/auth/v1/admin/users", {
    method: "POST",
    key: SERVICE,
    body: { email: `outsider.admin.${Date.now()}@gmail.com`, password: pw, email_confirm: true },
  });
  record(
    "admin-created user on another domain is refused by the trigger",
    r.status >= 400,
    short(r),
  );
}

{
  // SECURITY regression (migration 011): client-supplied email_verified must not count.
  const r = await call("/auth/v1/signup", {
    method: "POST",
    body: {
      email: `forged.${Date.now()}@example.test`,
      password: pw,
      data: { email_verified: true },
    },
  });
  record("signup with FORGED email_verified metadata is refused", r.status >= 400, short(r));
  const r2 = await call("/auth/v1/admin/users", {
    method: "POST",
    key: SERVICE,
    body: { email: `admin.made.${Date.now()}@example.test`, password: pw, email_confirm: true },
  });
  record(
    "non-Google account creation (admin API) is refused, Google-only policy",
    r2.status >= 400,
    short(r2),
  );
}

// A verified member, inserted the way a confirmed account arrives (privileged insert with
// email_confirmed_at), because local testing has no Google OAuth client. Password exists only so
// this script can obtain a real JWT from the Auth server.
const email = `api.member.${Date.now()}@example.test`;
const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "config.toml"), "utf8"),
)[1];
const userId = randomUUID();
{
  const sql = `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', '${userId}', 'authenticated', 'authenticated', '${email}',
      extensions.crypt('${pw}', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name":"Synthetic Api Member"}', now(), now(), '', '', '', '');`;
  const r = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      `supabase_db_${projectId}`,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8" },
  );
  record("verified member inserted (trigger accepts confirmed email)", r.status === 0, r.stderr);
}
let token;
{
  const r = await call("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password: pw },
  });
  token = r.json?.access_token;
  record("verified user can sign in", r.status === 200 && !!token, short(r));
}

// ---------- 3. Authenticated access through PostgREST ----------
if (token) {
  const r = await call("/rest/v1/profiles?select=id,full_name,role,domain_verified", { token });
  const rows = Array.isArray(r.json) ? r.json : [];
  record(
    "JWT maps to auth.uid(): user sees exactly their own profile",
    r.status === 200 && rows.length === 1 && rows[0].id === userId,
    short(r),
  );
  record(
    "profile name copied from metadata, role student, domain_verified",
    rows[0]?.full_name === "Synthetic Api Member" &&
      rows[0]?.role === "student" &&
      rows[0]?.domain_verified === true,
    short(r),
  );

  const p = await call(`/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    token,
    body: { role: "admin" },
  });
  record("user cannot PATCH their own role", denied(p) || p.status === 400, short(p));

  const s = await call("/rest/v1/rpc/save_draft", {
    method: "POST",
    token,
    body: { p_id: null, p_expected_version: null, p_payload: {} },
  });
  record(
    "not-yet-onboarded user cannot save a draft",
    s.status >= 400 && JSON.stringify(s.json).includes("onboarding_required"),
    short(s),
  );

  const deps = await call("/rest/v1/departments?select=id&limit=1");
  const batches = await call("/rest/v1/batches?select=id&limit=1");
  const o = await call("/rest/v1/rpc/complete_onboarding", {
    method: "POST",
    token,
    body: { p_department_id: deps.json[0].id, p_batch_id: batches.json[0].id, p_usn: "1RN00ZZ777" },
  });
  record("onboarding through the API works", o.status === 200 || o.status === 204, short(o));

  const u = await call("/rest/v1/rpc/get_my_usn", { method: "POST", token });
  record("owner can read own USN via RPC", JSON.stringify(u.json).includes("1RN00ZZ777"), short(u));

  const a = await call("/rest/v1/rpc/admin_get_usn", {
    method: "POST",
    token,
    body: { p_user: userId, p_reason: "attempted lookup by a student" },
  });
  record("student cannot call admin_get_usn", a.status >= 400, short(a));

  const pr = await call("/rest/v1/profile_private?select=*", {
    token,
    headers: { "Accept-Profile": "private" },
  });
  record("authenticated cannot reach private schema", denied(pr), short(pr));

  const ex = await call("/rest/v1/experiences?select=id", { token });
  record("authenticated is denied the experiences base table", denied(ex), short(ex));

  const d = await call("/rest/v1/rpc/delete_account_data", {
    method: "POST",
    token,
    body: { p_user: userId },
  });
  record("authenticated cannot run service-role deletion", denied(d) || d.status >= 400, short(d));

  const mod = await call("/rest/v1/moderation_experiences?select=id", { token });
  record(
    "student gets zero moderation rows",
    mod.status === 200 && Array.isArray(mod.json) && mod.json.length === 0,
    short(mod),
  );
}

// Forged JWT (wrong signature) is rejected
{
  const forged =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.invalidsignature";
  const r = await call("/rest/v1/profiles?select=*", { token: forged });
  record("forged JWT is rejected", r.status === 401 || r.status === 403, short(r));
}

// Clean up the API test user (data first, then the auth user), exercising the deletion flow.
if (userId && token) {
  const req = await call("/rest/v1/rpc/request_account_deletion", { method: "POST", token });
  const del = await call("/rest/v1/rpc/delete_account_data", {
    method: "POST",
    key: SERVICE,
    body: { p_user: userId },
  });
  const au = await call(`/auth/v1/admin/users/${userId}`, { method: "DELETE", key: SERVICE });
  record(
    "account deletion flow: request -> service-role data deletion -> auth user deletion",
    req.status < 300 && del.status < 300 && au.status < 300,
    `${req.status}/${del.status}/${au.status}`,
  );
}

const failed = results.filter((r) => !r.ok).length;
console.log(
  `\n${results.length - failed} passed, ${failed} failed (HTTP checks, real local Supabase).`,
);
process.exit(failed ? 1 : 0);

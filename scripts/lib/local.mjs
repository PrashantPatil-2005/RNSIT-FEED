// Shared helpers for the browser end-to-end scripts. LOCAL STACK ONLY.
//
// Real Google OAuth cannot run locally without an OAuth client, so test accounts are inserted by a
// privileged SQL statement (a confirmed email, as a verified Google sign-in would produce) and get
// real session cookies from @supabase/ssr with a password grant. Everything after that goes through
// the real app. Accounts are deleted with the same flow as account deletion.

import { execSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createServerClient } = require("@supabase/ssr");

export const APP = "http://127.0.0.1:3100";

export const env = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split(/\r?\n/)
    .map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (new URL(env.API_URL).hostname !== "127.0.0.1") {
  console.error("Refusing: the Supabase API is not local.");
  process.exit(2);
}
const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(
  readFileSync("supabase/config.toml", "utf8"),
)[1];

export function psql(sql) {
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
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

export const DEMO_COMPANY = "initech-demo";

export function hasDemoData() {
  return (
    psql(`select exists (select 1 from public.experiences e
      join public.companies c on c.id = e.company_id where c.slug = '${DEMO_COMPANY}')`) === "t"
  );
}

/** Browser tests depend on the demo seed; stop with a clear message instead of timing out. */
export function requireDemoData() {
  if (!hasDemoData()) {
    console.error("Demo data is missing. Run `npm run test:db` then `npm run db:seed:demo`.");
    process.exit(2);
  }
}

export function createChecker() {
  let failed = 0;
  const check = (name, ok, detail = "") => {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n      ${detail}`}`);
  };
  return { check, failed: () => failed };
}

/** Creates a confirmed test account. With `onboard`, also completes onboarding (dept 1, batch 1). */
export function createUser(label, { onboard = false } = {}) {
  const id = randomUUID();
  const email = `e2e.${label}.${Date.now()}@example.test`;
  const password = `Synthetic-${randomUUID()}`;
  psql(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${email}',
      extensions.crypt('${password}', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name":"Synthetic E2E ${label}"}', now(), now(), '', '', '', '');`);
  if (onboard) {
    const serial = String(100 + Math.floor(Math.random() * 400)).padStart(3, "0");
    const usn = `1RN00Z${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${serial}`;
    psql(`begin;
      select set_config('request.jwt.claim.sub', '${id}', true);
      select public.complete_onboarding(1::smallint, 1::smallint, '${usn}');
      commit;`);
  }
  return { id, email, password };
}

export function deleteUser(id) {
  psql(`begin;
    select set_config('app.profile_change', '1', true);
    update public.profiles set deletion_requested_at = now() where id = '${id}';
    select public.delete_account_data('${id}');
    delete from auth.users where id = '${id}';
    commit;`);
}

/** Signs in through @supabase/ssr and returns the cookies the app would set. */
export async function sessionCookies(user, { expireAccessToken = false } = {}) {
  const jar = new Map();
  const client = createServerClient(env.API_URL, env.ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) =>
        list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
  if (expireAccessToken) {
    for (const [name, value] of jar) {
      if (!value.startsWith("base64-")) continue;
      const s = JSON.parse(Buffer.from(value.slice(7), "base64url").toString());
      s.expires_at = Math.floor(Date.now() / 1000) - 60;
      jar.set(name, `base64-${Buffer.from(JSON.stringify(s)).toString("base64url")}`);
    }
  }
  return [...jar].map(([name, value]) => ({
    name,
    value,
    domain: "127.0.0.1",
    path: "/",
    sameSite: "Lax",
  }));
}

export async function waitForApp() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(APP);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`App not reachable at ${APP}`);
}

/** Gives a test account a staff role (privileged SQL, as an admin action would). */
export function setRole(id, role) {
  psql(`begin;
    select set_config('app.profile_change', '1', true);
    update public.profiles set role = '${role}' where id = '${id}';
    commit;`);
}

/**
 * Creates and submits a complete experience AS the given user, through save_draft and
 * submit_experience (the same database functions the app calls). Returns the experience id.
 */
export function submitAs(
  userId,
  { role = "E2E Role", anonymous = false, company = "initech-demo" } = {},
) {
  const payload = JSON.stringify({
    role_title: role,
    opportunity_type: "full_time",
    campus_type: "on_campus",
    recruitment_year: 2026,
    result: "selected",
    is_anonymous: anonymous,
    rounds: [
      { round_type: "technical", difficulty: 3, questions: [{ body: `E2E question for ${role}` }] },
    ],
  }).replace(/'/g, "''");
  return psql(`begin;
    select set_config('request.jwt.claim.sub', '${userId}', true);
    create temp table _r on commit drop as
      select (public.save_draft(null, null, jsonb_set('${payload}'::jsonb, '{company_id}',
        to_jsonb((select id from public.companies where slug = '${company}')))) ->> 'id')::uuid as id;
    select public.submit_experience((select id from _r));
    select id from _r;
    commit;`)
    .split(/\r?\n/)
    .filter((l) => /^[0-9a-f-]{36}$/.test(l))
    .pop();
}

/** Runs SQL as a user (request.jwt.claim.sub set), e.g. to simulate the author acting elsewhere. */
export function psqlAs(userId, sql) {
  return psql(`begin;
    select set_config('request.jwt.claim.sub', '${userId}', true);
    ${sql}
    commit;`);
}

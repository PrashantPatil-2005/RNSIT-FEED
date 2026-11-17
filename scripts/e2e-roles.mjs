// Role permission matrix, LOCAL STACK ONLY (plan P5, docs/ROLES-AND-STAFF-PANEL.md).
//
// For each role (visitor, student, alumni, moderator, admin) it checks:
//   1. every page answers as expected: 200, 404 (area not advertised) or a redirect to sign-in;
//   2. the header shows the Staff menu and admin links only to the right roles;
//   3. a signed-in /sign-in lands on the role's home page;
//   4. the DATABASE refuses staff/admin functions for the wrong role, called directly through the
//      API with the user's own session — i.e. even when the UI is bypassed. The probes use random
//      ids or too-short reasons, so an allowed call fails harmlessly (not_found / reason_required)
//      and nothing is changed.
//
// Requires the app on http://127.0.0.1:3100 and the demo data (npm run test:db).
// Usage: node scripts/e2e-roles.mjs

import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  APP,
  createChecker,
  createUser,
  deleteUser,
  env,
  requireDemoData,
  sessionCookies,
  setRole,
  waitForApp,
} from "./lib/local.mjs";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const { check, failed } = createChecker();
requireDemoData();
await waitForApp();

const ROLES = ["visitor", "student", "alumni", "moderator", "admin"];
const SIGN_IN = "sign-in";

/** Expected answer per page and role: 200, 404 or SIGN_IN (redirect to /sign-in?next=...). */
const PAGES = [
  ["/", { all: 200 }],
  ["/experiences", { all: 200 }],
  ["/companies", { all: 200 }],
  ["/guidelines", { all: 200 }],
  ["/share", { all: 200 }], // visitors see a sign-in prompt, not a redirect
  ["/account", { visitor: SIGN_IN, rest: 200 }],
  ["/my/experiences", { visitor: SIGN_IN, rest: 200 }],
  ["/moderation", { visitor: SIGN_IN, student: 404, alumni: 404, rest: 200 }],
  ["/moderation/reports", { visitor: SIGN_IN, student: 404, alumni: 404, rest: 200 }],
  ["/admin", { visitor: SIGN_IN, admin: 200, rest: 404 }],
  ["/admin/users", { visitor: SIGN_IN, admin: 200, rest: 404 }],
  ["/admin/invites", { visitor: SIGN_IN, admin: 200, rest: 404 }],
  ["/admin/companies", { visitor: SIGN_IN, admin: 200, rest: 404 }],
  ["/admin/audit", { visitor: SIGN_IN, admin: 200, rest: 404 }],
  ["/admin/team", { visitor: SIGN_IN, admin: 200, rest: 404 }],
];

function expected(rule, role) {
  return rule.all ?? rule[role] ?? rule.rest;
}

const HOME = { student: "/", alumni: "/", moderator: "/moderation", admin: "/admin" };
const STAFF = new Set(["moderator", "admin"]);

/** Database probes: [label, rpc, args, allowed roles]. */
const PROBES = [
  [
    "admin_set_user_role",
    "admin_set_user_role",
    { p_user: randomUUID(), p_role: "student", p_reason: "e2e roles probe, no such user" },
    ["admin"],
  ],
  ["admin_list_audit", "admin_list_audit", { p_reason: "short", p_limit: 1 }, ["admin"]],
  [
    "admin_create_company",
    "admin_create_company",
    { p_name: "E2E Probe", p_slug: "e2e-probe", p_reason: "short" },
    ["admin"],
  ],
  [
    "admin_invite_alumnus",
    "admin_invite_alumnus",
    { p_email: "probe@example.test", p_reason: "short" },
    ["admin"],
  ],
  [
    "moderate_experience",
    "moderate_experience",
    { p_id: randomUUID(), p_action: "approve" },
    ["moderator", "admin"],
  ],
  [
    "resolve_report",
    "resolve_report",
    { p_id: randomUUID(), p_outcome: "dismiss" },
    ["moderator", "admin"],
  ],
  [
    "admin_assign_moderator_department",
    "admin_assign_moderator_department",
    { p_user: randomUUID(), p_department: 1, p_reason: "e2e roles probe, no such user" },
    ["admin"],
  ],
  ["admin_moderator_coverage", "admin_moderator_coverage", {}, ["admin"]],
  ["admin_moderator_activity", "admin_moderator_activity", { p_days: 30 }, ["admin"]],
  ["my_moderation_activity", "my_moderation_activity", { p_days: 7 }, ["moderator", "admin"]],
  // Allowed for moderators only; the short reason makes it fail harmlessly (reason_required).
  ["moderator_step_down", "moderator_step_down", { p_reason: "short" }, ["moderator"]],
];

const users = [];
const accounts = {};

async function cookieHeader(user) {
  if (!user) return "";
  return (await sessionCookies(user)).map((c) => `${c.name}=${c.value}`).join("; ");
}

async function get(path, cookie) {
  return fetch(`${APP}${path}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
}

async function apiClient(user) {
  const client = createClient(env.API_URL, env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (user) {
    const { error } = await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (error) throw error;
  }
  return client;
}

try {
  for (const role of ROLES.slice(1)) {
    const u = createUser(`roles${role}`, { onboard: true });
    users.push(u);
    if (role !== "student") setRole(u.id, role);
    accounts[role] = u;
  }

  for (const role of ROLES) {
    const cookie = await cookieHeader(accounts[role]);

    // ---------- 1. Pages ----------
    for (const [path, rule] of PAGES) {
      const want = expected(rule, role);
      const r = await get(path, cookie);
      const loc = r.headers.get("location") ?? "";
      const ok =
        want === SIGN_IN
          ? r.status >= 300 && r.status < 400 && loc.includes(`/sign-in?next=`)
          : r.status === want;
      check(`${role}: ${path} -> ${want}`, ok, `got ${r.status} ${loc}`);
    }

    // ---------- 2. Header ----------
    const html = await (await get("/", cookie)).text();
    const hasStaffMenu = html.includes("staff-menu__summary");
    check(
      `${role}: Staff menu ${STAFF.has(role) ? "shown" : "hidden"}`,
      hasStaffMenu === STAFF.has(role),
    );
    const hasAdminLink = html.includes('href="/admin"');
    check(
      `${role}: admin links ${role === "admin" ? "shown" : "hidden"}`,
      hasAdminLink === (role === "admin"),
    );

    // ---------- 3. Landing after sign-in ----------
    if (role !== "visitor") {
      const r = await get("/sign-in", cookie);
      const loc = new URL(r.headers.get("location") ?? "/x", APP).pathname;
      check(
        `${role}: /sign-in lands on ${HOME[role]}`,
        loc === HOME[role],
        `got ${r.status} ${loc}`,
      );
      const r2 = await get(`/sign-in?next=${encodeURIComponent("/companies")}`, cookie);
      const loc2 = new URL(r2.headers.get("location") ?? "/x", APP).pathname;
      check(`${role}: explicit next wins`, loc2 === "/companies", loc2);
    }

    // ---------- 4. Database refuses the wrong role (UI bypassed) ----------
    const db = await apiClient(accounts[role]);
    for (const [label, fn, args, allowed] of PROBES) {
      const { error } = await db.rpc(fn, args);
      const msg = error?.message ?? "ok";
      if (allowed.includes(role)) {
        check(
          `${role}: db allows ${label}`,
          msg !== "forbidden" && !/permission denied/i.test(msg),
          msg,
        );
      } else {
        check(
          `${role}: db refuses ${label}`,
          error !== null &&
            (msg === "forbidden" || /permission denied|not_onboarded|unauthenticated/i.test(msg)),
          msg,
        );
      }
    }
    const { data: queue, error: qErr } = await db
      .from("moderation_experiences")
      .select("id")
      .limit(1);
    if (STAFF.has(role)) {
      check(`${role}: moderation view readable`, !qErr, qErr?.message);
    } else {
      check(
        `${role}: moderation view returns nothing`,
        qErr !== null || (queue ?? []).length === 0,
        `${(queue ?? []).length} rows`,
      );
    }
    await db.auth.signOut().catch(() => {});
  }
} finally {
  for (const u of users) {
    try {
      deleteUser(u.id);
    } catch (e) {
      console.error(`cleanup failed for ${u.id}: ${e.message}`);
    }
  }
}

console.log(failed() ? `\n${failed()} check(s) failed.` : "\nAll role checks passed.");
process.exit(failed() ? 1 : 0);

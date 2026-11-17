// End-to-end checks for the admin dashboard in a real browser, LOCAL STACK ONLY.
// Requires the app on http://127.0.0.1:3100, the synthetic demo data (npm run test:db), and
// `npm install --no-save playwright-core@1.64.0`.
// Usage: node scripts/e2e-admin.mjs

import { createRequire } from "node:module";
import {
  APP,
  createChecker,
  createUser,
  deleteUser,
  psql,
  requireDemoData,
  sessionCookies,
  setRole,
  waitForApp,
  waitForFormReset,
} from "./lib/local.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const { check, failed } = createChecker();
requireDemoData();
await waitForApp();

const browser = await chromium.launch({ channel: "msedge", headless: true });
const users = [];
const tag = Date.now().toString(36);
const companyName = `E2E Admin Co ${tag}`;
const role = (id) => psql(`select role from public.profiles where id = '${id}'`);

async function pageFor(user, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies(await sessionCookies(user));
  return { ctx, page: await ctx.newPage() };
}

/** Opens a row's <details> section and returns its form. */
async function openForm(page, rowText, summary) {
  const row = page.locator("li.my-item", { hasText: rowText }).first();
  const section = row.locator("details", { has: page.locator(`summary:has-text('${summary}')`) });
  await section.locator("summary").click();
  return section.locator("form");
}

try {
  const admin = createUser("admin", { onboard: true });
  const student = createUser("adminstudent", { onboard: true });
  const mod = createUser("adminmod", { onboard: true });
  users.push(admin, student, mod);
  setRole(admin.id, "admin");
  setRole(mod.id, "moderator");
  const studentName = `Synthetic E2E adminstudent`;

  // ---------- Access control ----------
  const vctx = await browser.newContext();
  const vp = await vctx.newPage();
  await vp.goto(`${APP}/admin`);
  check("visitor: /admin redirects to sign-in", vp.url().startsWith(`${APP}/sign-in`), vp.url());
  await vctx.close();

  for (const [label, u] of [
    ["student", student],
    ["moderator", mod],
  ]) {
    const s = await pageFor(u);
    for (const path of ["/admin", "/admin/users", "/admin/invites", "/admin/audit"]) {
      const r = await s.page.goto(`${APP}${path}`);
      check(`${label}: ${path} is 404`, r?.status() === 404);
    }
    await s.page.goto(`${APP}/`);
    check(
      `${label}: no Admin link in header`,
      (await s.page.locator(".header-actions >> text=Admin").count()) === 0,
    );
    await s.ctx.close();
  }

  const a = await pageFor(admin);
  const p = a.page;

  // ---------- Overview ----------
  await p.goto(`${APP}/`);
  await p.click(".header-actions .staff-menu__summary");
  const adminMenu = (await p.textContent(".header-actions .staff-menu__list")) ?? "";
  check(
    "admin: Staff menu shows admin and moderation links",
    adminMenu.includes("Admin dashboard") &&
      adminMenu.includes("Users and roles") &&
      adminMenu.includes("Moderation queue"),
    adminMenu,
  );
  await p.keyboard.press("Escape");
  check(
    "admin: Escape closes the Staff menu",
    !(await p.locator(".header-actions .staff-menu__list").isVisible()),
  );
  await p.goto(`${APP}/sign-in`);
  check("admin: signed-in /sign-in lands on /admin", p.url() === `${APP}/admin`, p.url());
  await p.goto(`${APP}/sign-in?next=${encodeURIComponent("/companies")}`);
  check("admin: explicit next still wins", p.url() === `${APP}/companies`, p.url());
  await p.goto(`${APP}/account`);
  check(
    "admin: account shows the role card",
    ((await p.textContent(".role-card")) ?? "").includes("Your role: Admin"),
  );
  await p.goto(`${APP}/admin`, { waitUntil: "networkidle" });
  const overview = (await p.textContent("main")) ?? "";
  check(
    "overview shows role counts and sections",
    overview.includes("Moderators") &&
      overview.includes("Alumni invites") &&
      overview.includes("Audit log"),
  );

  // ---------- Users and roles ----------
  await p.goto(`${APP}/admin/users?q=${encodeURIComponent("E2E adminstudent")}`, {
    waitUntil: "networkidle",
  });
  check(
    "search by name finds the member",
    (await p.locator("li.my-item", { hasText: studentName }).count()) === 1,
  );
  check(
    "no email or USN on the users page",
    !/@|1RN\d{2}/.test((await p.textContent("main")) ?? ""),
  );

  let form = await openForm(p, studentName, "Change role");
  await form.locator("select[name=role]").selectOption("moderator");
  await form.locator("input[name=reason]").fill("short");
  await form.locator("input[name=reason]").evaluate((el) => el.removeAttribute("minlength"));
  await form.locator("button[type=submit]").click();
  await form.locator(".form__error").waitFor();
  check(
    "short reason refused by the server",
    (await form.locator(".form__error").textContent())?.includes("at least 10 characters"),
  );
  check(
    "typed values survive a refused submit",
    (await form.locator("input[name=reason]").inputValue()) === "short" &&
      (await form.locator("select[name=role]").inputValue()) === "moderator",
  );
  check("role unchanged after refusal", role(student.id) === "student");

  await form.locator("input[name=reason]").fill("Appointed moderator for the E2E department");
  await form.locator("button[type=submit]").click();
  await form.locator(".form__ok").waitFor();
  check("role change confirmed", role(student.id) === "moderator");
  const s2 = await pageFor(student);
  const modPage = await s2.page.goto(`${APP}/moderation`);
  check("new moderator can open the moderation queue", modPage?.status() === 200);
  await s2.ctx.close();

  await p.reload({ waitUntil: "networkidle" });
  form = await openForm(p, studentName, "Change role");
  await form.locator("select[name=role]").selectOption("admin");
  await form.locator("input[name=reason]").fill("Trying to add a third admin here");
  await form.locator("button[type=submit]").click();
  await form.locator(".form__error").waitFor();
  check(
    "making an admin needs the confirmation tick",
    (await form.locator(".form__error").textContent())?.includes(
      "confirm making this person an admin",
    ) && role(student.id) === "moderator",
  );
  await form.locator("input[name=confirm_admin]").check();
  await form.locator("button[type=submit]").click();
  await form.locator(".form__error", { hasText: "at most two admins" }).waitFor();
  check(
    "admin limit enforced (at most two)",
    (await form.locator(".form__error").textContent())?.includes("at most two admins") &&
      role(student.id) === "moderator",
  );

  await form.locator("select[name=role]").selectOption("student");
  await form.locator("input[name=reason]").fill("End of the E2E moderator trial");
  await form.locator("button[type=submit]").click();
  await form.locator(".form__ok").waitFor();
  check("role set back to student", role(student.id) === "student");

  form = await openForm(p, studentName, "Correct name");
  await form.locator("input[name=name]").fill(`${studentName} Corrected`);
  await form.locator("input[name=reason]").fill("Typo in the Google profile name");
  await form.locator("button[type=submit]").click();
  await form.locator(".form__ok").waitFor();
  check(
    "name corrected",
    psql(`select full_name from public.profiles where id = '${student.id}'`) ===
      `${studentName} Corrected`,
  );

  await p.goto(`${APP}/admin/users?q=${encodeURIComponent("E2E admin")}`, {
    waitUntil: "networkidle",
  });
  const own = p.locator("li.my-item", { hasText: "(you)" });
  check(
    "own row has no role controls",
    (await own.count()) === 1 && (await own.locator("summary").count()) === 0,
  );

  // ---------- Alumni invites ----------
  const invitee = `alum.${tag}@gmail.com`;
  await p.goto(`${APP}/admin/invites`, { waitUntil: "networkidle" });
  const inv = p.getByRole("form", { name: "Invite an alumnus" });
  await inv.locator("input[name=email]").fill(invitee);
  await inv.locator("input[name=reason]").fill(`Known alumnus ${invitee}`);
  await inv.locator("button[type=submit]").click();
  await inv.locator(".form__error").waitFor();
  check(
    "reason containing an email is refused",
    (await inv.locator(".form__error").textContent())?.includes("email address"),
  );
  await inv.locator("input[name=email]").fill(`someone.${tag}@example.test`);
  await inv.locator("input[name=reason]").fill("Known alumnus from the 2019 batch");
  await inv.locator("button[type=submit]").click();
  await p
    .waitForFunction(
      () =>
        document
          .querySelector("[aria-label='Invite an alumnus'] .form__error")
          ?.textContent?.includes("College"),
      null,
      { timeout: 10000 },
    )
    .catch(() => {});
  check(
    "college address needs no invite",
    (await inv.locator(".form__error").textContent())?.includes("College addresses"),
  );
  await inv.locator("input[name=email]").fill(invitee);
  await inv.locator("button[type=submit]").click();
  await inv.locator(".form__ok").waitFor();
  check(
    "invite created (open, stored normalised)",
    psql(
      `select count(*) from private.alumni_invites where email = '${invitee}' and used_at is null and revoked_at is null`,
    ) === "1",
  );
  const masked = `a***@gmail.com`;
  await p.reload({ waitUntil: "networkidle" });
  check(
    "list shows the masked address, never the full one",
    (await p.textContent("main"))?.includes(masked) &&
      !(await p.textContent("main"))?.includes(invitee),
  );
  await inv.locator("input[name=email]").fill(invitee);
  await inv.locator("input[name=reason]").fill("Second invite for the same person");
  await inv.locator("button[type=submit]").click();
  await inv.locator(".form__error").waitFor();
  check(
    "duplicate open invite refused",
    (await inv.locator(".form__error").textContent())?.includes("already has an open invite"),
  );

  const inviteId = psql(`select id from private.alumni_invites where email = '${invitee}'`);
  const revokeRow = p.locator("li.my-item", {
    has: p.locator(`input[name=id][value='${inviteId}']`),
  });
  await revokeRow.locator("summary:has-text('Revoke')").click();
  await revokeRow.locator("input[name=reason]").fill("Invite created in error, revoking");
  await revokeRow.locator("button[type=submit]").click();
  // On success the page refreshes: the invite shows as Revoked and its revoke form goes away.
  await p.locator(`input[name=id][value='${inviteId}']`).waitFor({ state: "detached" });
  check(
    "revoked invite listed as Revoked with its address removed",
    (await p.textContent("main"))?.includes("Revoked") &&
      (await p.textContent("main"))?.includes("Address removed"),
  );
  check(
    "revoke clears the stored address",
    psql(
      `select (revoked_at is not null and email is null)::text from private.alumni_invites where id = '${inviteId}'`,
    ) === "true",
  );

  // ---------- Companies ----------
  await p.goto(`${APP}/admin/companies`, { waitUntil: "networkidle" });
  const cf = p.getByRole("form", { name: "Add a company" });
  await cf.locator("input[name=name]").fill(companyName);
  await cf.locator("input[name=reason]").fill("New recruiter visiting campus");
  await cf.locator("button[type=submit]").click();
  await cf.locator(".form__ok").waitFor();
  await waitForFormReset(cf, "input[name=name]");
  const slug = psql(`select slug from public.companies where name = '${companyName}'`);
  check("company created with a generated address", slug === `e2e-admin-co-${tag}`, slug);
  check("company page is public", (await fetch(`${APP}/companies/${slug}`)).status === 200);
  await cf.locator("input[name=name]").fill(companyName.toUpperCase());
  await cf.locator("input[name=reason]").fill("Adding the same company again");
  await cf.locator("button[type=submit]").click();
  await cf.locator(".form__error").waitFor();
  check(
    "duplicate company name refused (case-insensitive)",
    (await cf.locator(".form__error").textContent())?.includes("already exists"),
  );
  await p.reload({ waitUntil: "networkidle" });
  form = await openForm(p, companyName, "Add alias");
  await form.locator("input[name=alias]").fill(`E2E Alias ${tag}`);
  await form.locator("input[name=reason]").fill("Common short name used by students");
  await form.locator("button[type=submit]").click();
  await form.locator(".form__ok").waitFor();
  await p.reload({ waitUntil: "networkidle" });
  check(
    "alias listed under the company",
    (await p.locator("li.my-item", { hasText: companyName }).textContent())?.includes(
      `E2E Alias ${tag}`,
    ),
  );

  // ---------- Audit log ----------
  await p.goto(`${APP}/admin/audit`, { waitUntil: "networkidle" });
  check(
    "audit log is not loaded until a reason is given",
    (await p.locator("ol.my-list").count()) === 0,
  );
  await p.fill("#audit-reason", "Checking the E2E admin actions");
  await p.click("button:has-text('Open log')");
  await p.locator("ol.my-list").waitFor();
  const log = (await p.textContent("ol.my-list")) ?? "";
  check(
    "audit shows role, name, invite, company and viewing entries",
    [
      "Role changed",
      "Name corrected",
      "Alumnus invited",
      "Alumni invite revoked",
      "Company list changed",
      "Audit log viewed",
    ].every((t) => log.includes(t)),
  );
  check("audit names the acting admin", log.includes("Synthetic E2E admin"));
  check("audit shows no email address", !log.includes("@"));
  check(
    "viewing the log was itself recorded",
    psql(
      `select count(*) from private.admin_audit where action = 'view_audit' and actor_id = '${admin.id}'`,
    ) === "1",
  );

  // ---------- Phone layout ----------
  await a.ctx.close();
  const m = await pageFor(admin, { width: 360, height: 800 });
  for (const path of [
    "/admin",
    "/admin/users",
    "/admin/invites",
    "/admin/companies",
    "/admin/audit",
  ]) {
    await m.page.goto(`${APP}${path}`, { waitUntil: "networkidle" });
    const overflow = await m.page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`360px: ${path} has no horizontal scroll`, overflow <= 0, `overflow ${overflow}px`);
  }
  await m.ctx.close();
} finally {
  await browser.close();
  try {
    psql(`delete from public.companies where name = '${companyName}'`);
  } catch (e) {
    console.error(`company cleanup failed: ${e.message}`);
  }
  for (const u of users) {
    try {
      deleteUser(u.id);
    } catch (e) {
      console.error(`cleanup failed for a test user: ${e.message}`);
    }
  }
}
console.log(`\n${failed() === 0 ? "ALL PASS" : `${failed()} FAILED`} (admin e2e, local only)`);
process.exit(failed() ? 1 : 0);

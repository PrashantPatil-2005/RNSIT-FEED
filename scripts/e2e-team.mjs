// Moderator team, department scope and stepping down in a real browser, LOCAL STACK ONLY
// (plans P3 and P4, docs/ROLES-AND-STAFF-PANEL.md).
// Requires the app on http://127.0.0.1:3100 (`next start`, not `next dev`), the demo data
// (npm run test:db), and `npm install --no-save playwright-core@1.64.0`.
// Usage: node scripts/e2e-team.mjs

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
  submitAs,
  waitForApp,
} from "./lib/local.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const { check, failed } = createChecker();
requireDemoData();
await waitForApp();

const browser = await chromium.launch({ channel: "msedge", headless: true });
const users = [];
const role = (id) => psql(`select role from public.profiles where id = '${id}'`);
const assigned = (id) =>
  psql(`select count(*) from private.moderator_departments where user_id = '${id}'`);
// createUser onboards into department 1; demo departments 1–3 are CS, IS, EC.
const DEPT1 = psql("select code from public.departments where id = 1");
const DEPT2 = psql("select code from public.departments where id = 2");

async function pageFor(user, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies(await sessionCookies(user));
  return { ctx, page: await ctx.newPage() };
}

try {
  const admin = createUser("teamadmin", { onboard: true });
  const mod = createUser("teammod", { onboard: true });
  const author = createUser("teamauthor", { onboard: true });
  users.push(admin, mod, author);
  setRole(admin.id, "admin");
  setRole(mod.id, "moderator");
  const modName = "Synthetic E2E teammod";
  // A pending post in department 1 (the author's department) for the scoped queue.
  submitAs(author.id, { role: "E2E Team Scope" });

  // ---------- Admin: team page ----------
  const a = await pageFor(admin);
  const p = a.page;
  await p.goto(`${APP}/admin/team`, { waitUntil: "networkidle" });
  const team = (await p.textContent("main")) ?? "";
  check(
    "team page shows coverage summary and departments",
    team.includes("Departments covered") &&
      team.includes(DEPT1) &&
      team.includes("Need moderators"),
  );
  check("team page shows no email or USN", !/@|1RN\d{2}/.test(team));

  const assign = p.getByRole("form", { name: "Assign a moderator to a department" });
  // Rows are matched on the exact department code at the start of the title: hasText alone is a
  // case-insensitive substring match, so "IS" would also match other department names.
  const deptRow = (code) =>
    p
      .locator("li.team-dept")
      .filter({
        has: p.locator(".my-item__title", { hasText: new RegExp("^" + code + "(\\s|$)") }),
      });
  // Each submit waits for its own server-action response, so a message left over from the
  // previous submit is never mistaken for this one's result.
  const submitted = (page) =>
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().startsWith(APP));
  // `expect` is the outcome this submit should produce. For "ok" we also wait for ActionForm to
  // clear itself (it does so in an effect after a success), so the next step's field values are
  // not wiped. Messages left from the previous submit can therefore never satisfy the wait.
  async function assignTo(deptId, reason, expect) {
    await assign.locator("select[name=user]").selectOption({ label: modName });
    await assign.locator("select[name=department]").selectOption(String(deptId));
    await assign.locator("input[name=reason]").fill(reason);
    await Promise.all([submitted(p), assign.locator("button[type=submit]").click()]);
    await assign.evaluate(
      (form, want) =>
        new Promise((resolve) => {
          const done = () =>
            want === "ok"
              ? form.querySelector(".form__ok") &&
                !form.querySelector(".form__error") &&
                form.querySelector("input[name=reason]").value === ""
              : form.querySelector(".form__error") && !form.querySelector(".form__ok");
          const tick = () => (done() ? resolve() : requestAnimationFrame(tick));
          tick();
        }),
      expect,
    );
  }

  await assign.locator("input[name=reason]").evaluate((el) => el.removeAttribute("minlength"));
  await assignTo(1, "short", "error");
  await assign.locator(".form__error").waitFor();
  check(
    "short reason refused",
    (await assign.locator(".form__error").textContent())?.includes("at least 10 characters") &&
      assigned(mod.id) === "0",
  );
  await assignTo(1, "Covers the E2E department queue", "ok");
  await assign.locator(".form__ok").waitFor();
  check("department assigned", assigned(mod.id) === "1");
  await assignTo(2, "Second department for the E2E moderator", "ok");
  await assign.locator(".form__ok").waitFor();
  check("second department assigned", assigned(mod.id) === "2");
  await assignTo(2, "Duplicate assignment must be refused", "error");
  await assign.locator(".form__error").waitFor();
  check(
    "duplicate assignment refused with a clear message",
    (await assign.locator(".form__error").textContent())?.includes("already covers"),
  );

  // Fill department 3 to the limit with throwaway moderators, then try a fifth through the UI.
  const fillers = [1, 2, 3, 4].map((i) => createUser(`teamfill${i}`, { onboard: true }));
  users.push(...fillers);
  for (const f of fillers) setRole(f.id, "moderator");
  for (const f of fillers) {
    psql(
      `insert into private.moderator_departments (user_id, department_id) values ('${f.id}', 3)`,
    );
  }
  await p.reload({ waitUntil: "networkidle" });
  await assignTo(3, "A fifth moderator must be refused", "error");
  await assign.locator(".form__error").waitFor();
  check(
    "fifth moderator refused (department limit)",
    (await assign.locator(".form__error").textContent())?.includes("already has four moderators"),
  );
  check(
    "full department shows Full",
    (
      (await deptRow(psql("select code from public.departments where id = 3")).textContent()) ?? ""
    ).includes("Full"),
  );

  // Removing one department through its row form.
  const row2 = deptRow(DEPT2);
  await row2.locator("summary", { hasText: "Remove" }).first().click();
  const removeForm = row2.getByRole("form", { name: `Remove ${modName} from ${DEPT2}` });
  await removeForm.locator("input[name=reason]").fill("No longer covering this department");
  // On success the page re-renders without this member, so wait for the response, not a message.
  await Promise.all([submitted(p), removeForm.locator("button[type=submit]").click()]);
  await row2.locator(".team-members li", { hasText: modName }).waitFor({ state: "detached" });
  check("department removed", assigned(mod.id) === "1");

  await p.goto(`${APP}/admin/team?gaps=1`, { waitUntil: "networkidle" });
  check(
    "gaps filter lists only departments needing moderators",
    (await p.locator("li.team-dept", { hasText: "Full" }).count()) === 0,
  );
  const activity = (await p.locator('ul[aria-label="Staff activity"]').textContent()) ?? "";
  check("activity lists the moderator", activity.includes(modName));

  // ---------- Moderator: scoped queue and summary ----------
  const m = await pageFor(mod);
  const mp = m.page;
  await mp.goto(`${APP}/moderation`, { waitUntil: "networkidle" });
  const scope = (await mp.textContent('nav[aria-label="Departments"]')) ?? "";
  check(
    "queue offers My departments with the code",
    scope.includes(`My departments (${DEPT1})`),
    scope,
  );
  check(
    "My departments is the default",
    ((await mp.getAttribute('nav[aria-label="Departments"] a[aria-current="page"]', "href")) ??
      "") === "/moderation",
  );
  const summary = (await mp.textContent('dl[aria-label="Your moderation summary"]')) ?? "";
  check(
    "summary cards shown",
    summary.includes("Pending in your departments") &&
      summary.includes("Your decisions, last 7 days"),
  );
  const scopedRows = await mp.locator(".queue-row").allTextContents();
  check(
    "scoped queue shows only my department",
    scopedRows.length > 0 && scopedRows.every((t) => t.includes(`${DEPT1} ·`)),
    scopedRows.join(" | "),
  );
  check(
    "scoped queue includes the new post",
    scopedRows.some((t) => t.includes("E2E Team Scope")),
  );
  await mp.click('nav[aria-label="Departments"] >> text=All departments');
  await mp.waitForURL(`${APP}/moderation?scope=all`);
  check(
    "All departments keeps the scope in status tabs",
    (
      (await mp.getAttribute('nav[aria-label="Filter by status"] a >> nth=1', "href")) ?? ""
    ).includes("scope=all"),
  );

  // ---------- Moderator: account shows departments, then steps down ----------
  await mp.goto(`${APP}/account`, { waitUntil: "networkidle" });
  const card = (await mp.textContent(".role-card")) ?? "";
  check("account lists my departments", card.includes("Your departments:") && card.includes(DEPT1));
  await mp.click("details.step-down > summary");
  const stepForm = mp.getByRole("form", { name: "Step down as moderator" });
  await stepForm.locator("input[name=reason]").fill("Exams this semester, stepping down");
  await stepForm.locator("input[name=confirm]").evaluate((el) => el.removeAttribute("required"));
  await stepForm.locator("button[type=submit]").click();
  await stepForm.locator(".form__error").waitFor();
  check(
    "step down needs the confirmation tick",
    (await stepForm.locator(".form__error").textContent())?.includes("Tick the box") &&
      role(mod.id) === "moderator",
  );
  await stepForm.locator("input[name=confirm]").check();
  await Promise.all([
    mp.waitForURL(`${APP}/account?stepped_down=1`),
    stepForm.locator("button[type=submit]").click(),
  ]);
  check("stepped down to student", role(mod.id) === "student");
  check("step down cleared departments", assigned(mod.id) === "0");
  check(
    "confirmation shown after stepping down",
    ((await mp.textContent("main")) ?? "").includes("You are no longer a moderator"),
  );
  check(
    "Staff menu gone after stepping down",
    (await mp.locator(".header-actions .staff-menu").count()) === 0,
  );
  const after = await mp.goto(`${APP}/moderation`);
  check("former moderator gets 404 on the queue", after?.status() === 404);
  await m.ctx.close();

  // ---------- Admin: role history shows the self-service change ----------
  await p.goto(`${APP}/admin/users?q=${encodeURIComponent("teammod")}`, {
    waitUntil: "networkidle",
  });
  await p
    .locator("li.my-item", { hasText: modName })
    .locator("a", { hasText: "Role history" })
    .click();
  await p.waitForURL(/history=/);
  const hist = (await p.textContent('section[aria-labelledby="history-title"]')) ?? "";
  check(
    "role history shows the step down",
    hist.includes("Moderator → Student") && hist.includes("stepped down themselves"),
    hist,
  );
  await a.ctx.close();
} finally {
  await browser.close();
  for (const u of users) {
    try {
      deleteUser(u.id);
    } catch (e) {
      console.error(`cleanup failed for ${u.id}: ${e.message}`);
    }
  }
}

console.log(failed() ? `\n${failed()} check(s) failed.` : "\nAll team checks passed.");
process.exit(failed() ? 1 : 0);

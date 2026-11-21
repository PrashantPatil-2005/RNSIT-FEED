// Account deletion request (U5) in a real browser, LOCAL STACK ONLY.
// Requires the app on http://127.0.0.1:3100 (`next start`, not `next dev`) and
// `npm install --no-save playwright-core@1.64.0`.
// Usage: node scripts/e2e-account.mjs

import { createRequire } from "node:module";
import {
  APP,
  createChecker,
  createUser,
  deleteUser,
  psql,
  psqlAs,
  sessionCookies,
  setRole,
  waitForApp,
} from "./lib/local.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const { check, failed } = createChecker();
await waitForApp();

const browser = await chromium.launch({ channel: "msedge", headless: true });
const users = [];
const requested = (id) =>
  psql(`select deletion_requested_at is not null from public.profiles where id = '${id}'`);
const submitted = (page) =>
  page.waitForResponse((r) => r.request().method() === "POST" && r.url().startsWith(APP));

async function pageFor(user) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies(await sessionCookies(user));
  return { ctx, page: await ctx.newPage() };
}

try {
  const member = createUser("delmember", { onboard: true });
  users.push(member);

  // ---------- Member: wrong confirmation, then a real request ----------
  const m = await pageFor(member);
  let p = m.page;
  await p.goto(`${APP}/account`, { waitUntil: "networkidle" });
  await p.getByText("Delete my account", { exact: true }).first().click();
  const form = p.getByRole("form", { name: "Delete my account" });
  check("account page shows the delete form", (await form.count()) === 1);

  await form.getByLabel("Type DELETE to confirm").fill("delete");
  let wait = submitted(p);
  await form.getByRole("button", { name: "Delete my account" }).click();
  await wait;
  await form.locator(".form__error").waitFor();
  check(
    "lower-case confirmation is refused",
    ((await form.locator(".form__error").textContent()) ?? "").includes("DELETE"),
  );
  check("refused confirmation leaves the account alone", requested(member.id) === "f");

  await form.getByLabel("Type DELETE to confirm").fill("DELETE");
  wait = submitted(p);
  await form.getByRole("button", { name: "Delete my account" }).click();
  await wait;
  await p.waitForURL(/deletion=requested/);
  check("request marks the profile", requested(member.id) === "t");
  const after = (await p.textContent("main")) ?? "";
  check("account page confirms the request", after.includes("Account deletion requested"));
  check(
    "delete form is gone after the request",
    (await p.getByRole("form", { name: "Delete my account" }).count()) === 0,
  );

  await p.goto(`${APP}/share`, { waitUntil: "networkidle" });
  check(
    "locked account cannot open the editor",
    (await p.locator("form textarea, form input[name='role_title']").count()) === 0,
  );

  // ---------- Member changes their mind ----------
  await p.goto(`${APP}/account`, { waitUntil: "networkidle" });
  const cf = p.getByRole("form", { name: "Cancel account deletion" });
  check("own request offers a cancel button", (await cf.count()) === 1);
  wait = submitted(p);
  await cf.getByRole("button", { name: "Cancel deletion" }).click();
  await wait;
  await p.waitForURL(/deletion=cancelled/);
  check("cancel clears the flag", requested(member.id) === "f");
  check(
    "account page confirms the cancel and offers delete again",
    ((await p.textContent("main")) ?? "").includes("Deletion cancelled") &&
      (await p.getByText("Delete my account", { exact: true }).count()) > 0,
  );
  await m.ctx.close();

  // ---------- A deletion forced by an admin offers no cancel ----------
  const forced = createUser("delforced", { onboard: true });
  users.push(forced);
  const anAdmin = psql(
    "select id from public.profiles where role = 'admin' and deletion_requested_at is null limit 1",
  );
  psqlAs(
    anAdmin,
    `select public.admin_request_user_deletion('${forced.id}', 'Synthetic forced deletion');`,
  );
  const fp = await pageFor(forced);
  await fp.page.goto(`${APP}/account`, { waitUntil: "networkidle" });
  check(
    "forced deletion shows no cancel button",
    (await fp.page.getByRole("form", { name: "Cancel account deletion" }).count()) === 0 &&
      ((await fp.page.textContent("main")) ?? "").includes("only they can stop it"),
  );
  await fp.ctx.close();

  // ---------- The only admin is refused ----------
  const admins = Number(
    psql(
      "select count(*) from public.profiles where role = 'admin' and deletion_requested_at is null",
    ),
  );
  if (admins === 0) {
    const admin = createUser("deladmin", { onboard: true });
    users.push(admin);
    setRole(admin.id, "admin");
    const a = await pageFor(admin);
    p = a.page;
    await p.goto(`${APP}/account`, { waitUntil: "networkidle" });
    await p.getByText("Delete my account", { exact: true }).first().click();
    const af = p.getByRole("form", { name: "Delete my account" });
    await af.getByLabel("Type DELETE to confirm").fill("DELETE");
    wait = submitted(p);
    await af.getByRole("button", { name: "Delete my account" }).click();
    await wait;
    await af.locator(".form__error").waitFor();
    check(
      "last admin is refused",
      ((await af.locator(".form__error").textContent()) ?? "").includes("only admin") &&
        requested(admin.id) === "f",
    );
    await a.ctx.close();
  } else {
    console.log(`skip: last-admin check (${admins} admin(s) already in the local DB)`);
  }
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

console.log(failed() ? `\n${failed()} check(s) failed.` : "\nAll account checks passed.");
process.exit(failed() ? 1 : 0);

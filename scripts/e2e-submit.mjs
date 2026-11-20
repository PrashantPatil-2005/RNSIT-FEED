// End-to-end checks for Phase 2 (experience submission) in a real browser, LOCAL STACK ONLY.
// Requires the app on http://127.0.0.1:3100 and `npm install --no-save playwright-core@1.64.0`.
// Usage: node scripts/e2e-submit.mjs

import { createRequire } from "node:module";
import {
  APP,
  createChecker,
  createUser,
  deleteUser,
  psql,
  requireDemoData,
  sessionCookies,
  waitForApp,
} from "./lib/local.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const { check, failed } = createChecker();
requireDemoData();
await waitForApp();

const browser = await chromium.launch({ channel: "msedge", headless: true });
const users = [];
const draftId = (url) => /\/share\/([0-9a-f-]{36})/.exec(url)?.[1];
const dbStatus = (id) => psql(`select status from public.experiences where id = '${id}'`);
const savedState = (page) =>
  page.waitForFunction(
    () => document.querySelector(".save-state")?.textContent?.startsWith("Draft saved"),
    null,
    { timeout: 15000 },
  );

try {
  // ---------- Visitors ----------
  const vctx = await browser.newContext();
  const vp = await vctx.newPage();
  await vp.goto(`${APP}/share`);
  check(
    "visitor sees a sign-in prompt, not the editor",
    (await vp.locator("text=Sign in to share").count()) > 0 &&
      (await vp.locator(".editor").count()) === 0,
  );
  await vp.goto(`${APP}/share/a0000000-0000-4000-8000-000000000001`);
  check("visitor: draft URL redirects to sign-in", vp.url().startsWith(`${APP}/sign-in`), vp.url());
  await vp.goto(`${APP}/my/experiences`);
  check(
    "visitor: /my/experiences redirects to sign-in",
    vp.url().startsWith(`${APP}/sign-in`),
    vp.url(),
  );
  await vctx.close();

  // ---------- Author A ----------
  const a = createUser("author", { onboard: true });
  users.push(a);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies(await sessionCookies(a));
  const p = await ctx.newPage();
  await p.goto(`${APP}/share`, { waitUntil: "networkidle" });
  check("signed-in member sees the editor", (await p.locator("form.editor").count()) === 1);
  check(
    "department and batch come from the profile (not editable)",
    (await p.textContent(".editor__bar"))?.includes("Posting as Synthetic E2E author"),
  );
  check(
    "anonymity has no preselected option",
    (await p.locator('input[name="anonymity"]:checked').count()) === 0,
  );
  const before = Number(
    psql(`select count(*) from private.experience_authors where author_id = '${a.id}'`),
  );
  check("visiting /share stores nothing", before === 0);

  // Autosave creates the draft and makes the URL resumable
  await p.fill("#roleTitle", "E2E Phase Two Role");
  await savedState(p);
  const id = draftId(p.url());
  check("autosave creates a draft and updates the URL", !!id, p.url());
  check(
    "draft stored as draft with the typed title",
    dbStatus(id) === "draft" &&
      psql(`select role_title from public.experiences where id = '${id}'`) === "E2E Phase Two Role",
  );

  // Partial input: short question is reported, not lost or failing the whole save
  await p.selectOption("#round-0-type", "technical");
  await p.fill("#round-0-q0", "Too short");
  await savedState(p);
  check(
    "short question reported as not saved yet",
    (await p.textContent(".notice--warn"))?.includes("question 1"),
  );
  await p.fill("#round-0-q0", "E2E question: explain how a hash map handles collisions");
  await p.fill("#round-0-duration", "45");
  await p.selectOption("#round-0-difficulty", "4");
  await p.locator(".round-editor .toggle-chip").first().click();
  await savedState(p);
  check("valid question saved (warning cleared)", (await p.locator(".notice--warn").count()) === 0);

  // Recovery after reload
  await p.reload({ waitUntil: "networkidle" });
  check(
    "draft recovered after reload",
    (await p.inputValue("#roleTitle")) === "E2E Phase Two Role" &&
      (await p.inputValue("#round-0-q0")).includes("hash map") &&
      (await p.inputValue("#round-0-duration")) === "45",
  );

  // Conflict between two tabs
  const p2 = await ctx.newPage();
  await p2.goto(`${APP}/share/${id}`, { waitUntil: "networkidle" });
  await p2.fill("#roleTitle", "E2E Phase Two Role (tab B)");
  await savedState(p2);
  await p.fill("#roleTitle", "E2E Phase Two Role (tab A, stale)");
  await p.waitForFunction(
    () => document.querySelector(".save-state")?.textContent?.includes("changed elsewhere"),
    null,
    { timeout: 15000 },
  );
  check(
    "stale tab gets a conflict instead of overwriting",
    (await p.textContent(".form__error"))?.includes("changed in another tab"),
  );
  check(
    "newer content kept in the database",
    psql(`select role_title from public.experiences where id = '${id}'`) ===
      "E2E Phase Two Role (tab B)",
  );
  await p2.close();
  await p.reload({ waitUntil: "networkidle" });
  check(
    "reload loads the latest version",
    (await p.inputValue("#roleTitle")) === "E2E Phase Two Role (tab B)",
  );

  // Submit with missing fields -> summary, nothing submitted
  await p.click("button:has-text('Submit for review')");
  await p.waitForSelector(".form__error[role=alert] li");
  const summary = (await p.textContent(".form__error[role=alert]")) ?? "";
  check(
    "submit lists missing fields",
    summary.includes("Enter the company name") &&
      summary.includes("post under your name or anonymously"),
  );
  check(
    "summary receives focus",
    await p.evaluate(() => document.activeElement?.classList.contains("form__error")),
  );
  check("still a draft after a failed submit", dbStatus(id) === "draft");

  // Complete everything (anonymous) and submit
  await p.fill("#companyName", "Initech (demo)");
  await p.fill("#recruitmentYear", "2026");
  await p.check('input[name="opportunityType"][value="internship"]');
  await p.check('input[name="campusType"][value="on_campus"]');
  await p.check('input[name="result"][value="selected"]');
  await p.fill("#minCgpa", "7.5");
  await p.click("button:has-text('+ Add link')");
  await p.fill("#res-url-0", "https://example.test/e2e-guide");
  await p.check('input[name="anonymity"][value="yes"]');
  await p.fill("#prepTips", "<img src=x onerror=alert(1)> E2E tip");
  await Promise.all([
    p.waitForURL(`${APP}/my/experiences?submitted=1`, { timeout: 20000 }),
    p.click("button:has-text('Submit for review')"),
  ]);
  check(
    "submit lands on My experiences with confirmation",
    (await p.textContent("main"))?.includes("Submitted for review"),
  );
  check("status is pending (moderation required)", dbStatus(id) === "pending");
  check(
    "anonymous flag stored",
    psql(`select is_anonymous from public.experiences where id = '${id}'`) === "t",
  );
  check(
    "list shows Waiting for review",
    (await p.textContent(".my-list"))?.includes("Waiting for review"),
  );
  const pub = await (await fetch(`${APP}/experiences?q=hash%20map%20handles`)).text();
  check("pending post is not public", !pub.includes("Phase Two Role"));
  const detail = await fetch(`${APP}/experiences/${id}`);
  check("pending post detail page is 404 publicly", detail.status === 404);

  // No editing after submit; double submit impossible
  await p.goto(`${APP}/share/${id}`);
  check("submitted draft URL is no longer editable", p.url() === `${APP}/my/experiences`, p.url());

  // Duplicate submission: same company + role + year
  await p.goto(`${APP}/share`, { waitUntil: "networkidle" });
  await p.fill("#companyName", "Initech (demo)");
  await p.fill("#roleTitle", "e2e phase two role (TAB B)");
  await p.fill("#recruitmentYear", "2026");
  await p.check('input[name="opportunityType"][value="internship"]');
  await p.check('input[name="campusType"][value="on_campus"]');
  await p.check('input[name="result"][value="rejected"]');
  await p.selectOption("#round-0-type", "hr");
  await p.fill("#round-0-q0", "E2E duplicate attempt question text");
  await p.check('input[name="anonymity"][value="no"]');
  await savedState(p);
  const dupId = draftId(p.url());
  await p.click("button:has-text('Submit for review')");
  await p.waitForFunction(
    () =>
      document
        .querySelector(".form__error[role=alert]")
        ?.textContent?.includes("already have a pending"),
    null,
    { timeout: 15000 },
  );
  check("duplicate submission refused with a clear message", true);
  check("duplicate stays a draft", dbStatus(dupId) === "draft");

  // Cancel the pending one from the list, then delete the duplicate draft
  await p.goto(`${APP}/my/experiences`);
  const pendingItem = p.locator(".my-item", { hasText: "Waiting for review" });
  await pendingItem.locator("summary:has-text('Pull back to draft')").click();
  await Promise.all([
    p.waitForURL(new RegExp(`/share/${id}`)),
    pendingItem.locator("button:has-text('Yes, pull it back')").click(),
  ]);
  check("pending post pulled back to draft", dbStatus(id) === "draft");
  await p.goto(`${APP}/my/experiences`);
  const dupItem = p
    .locator(".my-item", { hasText: "TAB B" })
    .filter({ hasText: "Draft" })
    .filter({ hasText: "Under your name" });
  await dupItem.locator("summary:has-text('Delete')").click();
  await Promise.all([
    p.waitForURL(`${APP}/my/experiences?deleted=1`),
    dupItem.locator("button:has-text('Delete draft')").click(),
  ]);
  check(
    "draft deleted",
    psql(`select count(*) from public.experiences where id = '${dupId}'`) === "0",
  );

  // Stored text is rendered as text (no HTML injection)
  check(
    "injected HTML in tips not rendered as an element",
    (await p.locator("img[src=x]").count()) === 0,
  );

  // ---------- Another member cannot reach A's draft ----------
  const b = createUser("intruder", { onboard: true });
  users.push(b);
  const bctx = await browser.newContext();
  await bctx.addCookies(await sessionCookies(b));
  const bp = await bctx.newPage();
  const res = await bp.goto(`${APP}/share/${id}`);
  check("another member gets 404 for someone else's draft", res?.status() === 404);
  await bp.goto(`${APP}/my/experiences`);
  check(
    "another member's list does not include A's posts",
    !(await bp.textContent("main"))?.includes("Phase Two Role"),
  );
  await bctx.close();

  // ---------- Not-onboarded member is sent to onboarding ----------
  const c = createUser("newbie");
  users.push(c);
  const cctx = await browser.newContext();
  await cctx.addCookies(await sessionCookies(c));
  const cp = await cctx.newPage();
  await cp.goto(`${APP}/share`);
  check(
    "not-onboarded member is sent to onboarding first",
    cp.url().startsWith(`${APP}/onboarding`),
    cp.url(),
  );
  await cctx.close();
  await ctx.close();
} finally {
  await browser.close();
  for (const u of users) {
    try {
      deleteUser(u.id);
    } catch (e) {
      console.error(`cleanup failed for a test user: ${e.message}`);
    }
  }
}
console.log(`\n${failed() === 0 ? "ALL PASS" : `${failed()} FAILED`} (submission e2e, local only)`);
process.exit(failed() ? 1 : 0);

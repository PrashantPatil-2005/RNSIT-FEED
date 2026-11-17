// End-to-end checks for Phase 3 (moderation) in a real browser, LOCAL STACK ONLY.
// Requires the app on http://127.0.0.1:3100, the synthetic demo data, and
// `npm install --no-save playwright-core@1.64.0`.
// Usage: node scripts/e2e-moderation.mjs

import { createRequire } from "node:module";
import {
  APP,
  createChecker,
  createUser,
  deleteUser,
  psql,
  psqlAs,
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
const status = (id) => psql(`select status from public.experiences where id = '${id}'`);
const tag = Date.now().toString(36);

async function pageFor(user, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies(await sessionCookies(user));
  return { ctx, page: await ctx.newPage() };
}

try {
  const author = createUser("modauthor", { onboard: true });
  const author2 = createUser("modauthor2", { onboard: true }); // authors may have at most 5 pending posts
  const student = createUser("modstudent", { onboard: true });
  const mod = createUser("moderator", { onboard: true });
  const mod2 = createUser("moderator2", { onboard: true });
  users.push(author, author2, student, mod, mod2);
  setRole(mod.id, "moderator");
  setRole(mod2.id, "moderator");

  const named = submitAs(author.id, { role: `Named ${tag}` });
  const anon = submitAs(author.id, { role: `Anon ${tag}`, anonymous: true });
  const toReturn = submitAs(author.id, { role: `Return ${tag}` });
  const toReject = submitAs(author.id, { role: `Reject ${tag}` });
  const race = submitAs(author.id, { role: `Race ${tag}` });
  const stale = submitAs(author2.id, { role: `Stale ${tag}` });
  const own = submitAs(mod.id, { role: `Own ${tag}` });

  // ---------- Access control ----------
  const vctx = await browser.newContext();
  const vp = await vctx.newPage();
  await vp.goto(`${APP}/moderation`);
  check(
    "visitor: /moderation redirects to sign-in",
    vp.url().startsWith(`${APP}/sign-in`),
    vp.url(),
  );
  await vctx.close();

  const s = await pageFor(student);
  const r1 = await s.page.goto(`${APP}/moderation`);
  check("student: /moderation is 404", r1?.status() === 404);
  const r2 = await s.page.goto(`${APP}/moderation/${named}`);
  check("student: review page is 404", r2?.status() === 404);
  await s.page.goto(`${APP}/`);
  check(
    "student: no Staff menu in header",
    (await s.page.locator(".header-actions .staff-menu").count()) === 0,
  );
  await s.page.goto(`${APP}/sign-in`);
  check("student: signed-in /sign-in lands on /", s.page.url() === `${APP}/`, s.page.url());
  await s.ctx.close();

  // ---------- Queue ----------
  const m = await pageFor(mod);
  const mp = m.page;
  await mp.goto(`${APP}/`);
  await mp.click(".header-actions .staff-menu__summary");
  const modMenu = (await mp.textContent(".header-actions .staff-menu__list")) ?? "";
  check(
    "moderator: Staff menu shows moderation links, no admin links",
    modMenu.includes("Moderation queue") &&
      modMenu.includes("Reports") &&
      !modMenu.includes("Admin"),
    modMenu,
  );
  await mp.goto(`${APP}/sign-in`);
  check(
    "moderator: signed-in /sign-in lands on /moderation",
    mp.url() === `${APP}/moderation`,
    mp.url(),
  );
  await mp.goto(`${APP}/moderation`, { waitUntil: "networkidle" });
  const queue = (await mp.textContent(".queue")) ?? "";
  check(
    "queue lists pending submissions",
    queue.includes(`Named ${tag}`) && queue.includes(`Anon ${tag}`),
  );
  const anonRow = (await mp.locator(".queue-row", { hasText: `Anon ${tag}` }).textContent()) ?? "";
  check(
    "anonymous row shows Anonymous, no name",
    anonRow.includes("Anonymous") && !anonRow.includes("Synthetic E2E modauthor"),
  );
  check(
    "pending tab is current with a count",
    (await mp.getAttribute(
      'nav[aria-label="Filter by status"] .queue-tab[aria-current="page"]',
      "href",
    )) === "/moderation",
  );

  // ---------- Anonymous review page never shows the author ----------
  await mp.goto(`${APP}/moderation/${anon}`, { waitUntil: "networkidle" });
  const html = await mp.content();
  check(
    "anonymous review: author hidden",
    html.includes("hidden from moderators") && !html.includes("modauthor"),
  );

  // ---------- Approve ----------
  await mp.goto(`${APP}/moderation/${named}`, { waitUntil: "networkidle" });
  check(
    "named review shows the author",
    (await mp.textContent(".byline"))?.includes("Synthetic E2E modauthor"),
  );
  check(
    "review shows rounds and questions",
    (await mp.textContent("main"))?.includes(`E2E question for Named ${tag}`),
  );
  await Promise.all([
    mp.waitForURL(`${APP}/moderation?done=approve`),
    mp.click("button:has-text('Approve and publish')"),
  ]);
  check(
    "approve: confirmation shown",
    (await mp.textContent("main"))?.includes("It is now public"),
  );
  check("approve: status approved", status(named) === "approved");
  check(
    "approved post is publicly visible",
    (await fetch(`${APP}/experiences/${named}`)).status === 200,
  );

  // ---------- Server-side validation of notes ----------
  await mp.goto(`${APP}/moderation/${toReturn}`, { waitUntil: "networkidle" });
  await mp.click("button:has-text('Request changes')");
  await mp.selectOption("#reason", "low_quality");
  await mp.fill("#note", "short");
  await mp.evaluate(() => {
    const n = document.querySelector("#note");
    n.removeAttribute("required");
    n.removeAttribute("minlength");
  });
  await mp.click("button:has-text('Send back for changes')");
  await mp.waitForSelector(".decision .form__error");
  check(
    "short note rejected by the server",
    (await mp.textContent(".decision .form__error"))?.includes("at least 10 characters"),
  );
  check("still pending after a refused decision", status(toReturn) === "pending");
  check(
    "chosen reason and note survive a refused submit",
    (await mp.inputValue("#reason")) === "low_quality" &&
      (await mp.inputValue("#note")) === "short",
  );

  // ---------- Request changes ----------
  await mp.fill("#note", "Please add the questions from the technical round.");
  await Promise.all([
    mp.waitForURL(`${APP}/moderation?done=return`),
    mp.click("button:has-text('Send back for changes')"),
  ]);
  check("return: status returned", status(toReturn) === "returned");

  // ---------- Reject ----------
  await mp.goto(`${APP}/moderation/${toReject}`, { waitUntil: "networkidle" });
  await mp.click("button:has-text('Reject')");
  await mp.selectOption("#reason", "nda");
  await mp.fill("#note", "Copied from a confidential assessment.");
  await Promise.all([
    mp.waitForURL(`${APP}/moderation?done=reject`),
    mp.click("button:has-text('Reject permanently')"),
  ]);
  check("reject: status rejected", status(toReject) === "rejected");
  check(
    "rejected and returned posts are not public",
    (await fetch(`${APP}/experiences/${toReject}`)).status === 404 &&
      (await fetch(`${APP}/experiences/${toReturn}`)).status === 404,
  );

  // ---------- Filters ----------
  for (const [f, title] of [
    ["returned", `Return ${tag}`],
    ["rejected", `Reject ${tag}`],
    ["approved", `Named ${tag}`],
  ]) {
    await mp.goto(`${APP}/moderation?status=${f}`, { waitUntil: "networkidle" });
    check(`filter ${f} lists the right post`, (await mp.textContent("main"))?.includes(title));
  }
  await mp.goto(`${APP}/moderation?status=bogus`, { waitUntil: "networkidle" });
  check(
    "unknown filter falls back to pending",
    (await mp.getAttribute(
      'nav[aria-label="Filter by status"] .queue-tab[aria-current="page"]',
      "href",
    )) === "/moderation",
  );

  // ---------- History ----------
  await mp.goto(`${APP}/moderation/${toReject}`, { waitUntil: "networkidle" });
  const hist = (await mp.textContent(".history")) ?? "";
  check(
    "history shows submit and reject with reason and moderator",
    hist.includes("Submitted") &&
      hist.includes("Rejected · Confidential or NDA material") &&
      hist.includes("Synthetic E2E moderator"),
  );
  check(
    "decided post shows no decision buttons",
    (await mp.locator("button:has-text('Approve and publish')").count()) === 0,
  );

  // ---------- Concurrent decisions ----------
  const m2 = await pageFor(mod2);
  await mp.goto(`${APP}/moderation/${race}`, { waitUntil: "networkidle" });
  await m2.page.goto(`${APP}/moderation/${race}`, { waitUntil: "networkidle" });
  await Promise.all([
    m2.page.waitForURL(`${APP}/moderation?done=approve`),
    m2.page.click("button:has-text('Approve and publish')"),
  ]);
  await mp.click("button:has-text('Reject')");
  await mp.selectOption("#reason", "other");
  await mp.fill("#note", "Late conflicting decision attempt.");
  await mp.click("button:has-text('Reject permanently')");
  await mp.waitForSelector(".decision .form__error");
  check(
    "second moderator is told it was already decided",
    (await mp.textContent(".decision .form__error"))?.includes("already decided"),
  );
  check("first decision stands", status(race) === "approved");
  await m2.ctx.close();

  // ---------- Stale review (author changed the post after it was opened) ----------
  await mp.goto(`${APP}/moderation/${stale}`, { waitUntil: "networkidle" });
  psqlAs(
    author2.id,
    `select public.cancel_submission('${stale}');
    select public.save_draft('${stale}', (select row_version from public.experiences where id = '${stale}'), '{"prep_tips":"Changed after review started"}');
    select public.submit_experience('${stale}');`,
  );
  await mp.click("button:has-text('Approve and publish')");
  await mp.waitForSelector(".decision .form__error");
  check(
    "stale approval refused (author changed it)",
    (await mp.textContent(".decision .form__error"))?.includes("changed this experience"),
  );
  check("stale post still pending", status(stale) === "pending");
  await mp.click(".decision button:has-text('Reload')");
  await mp.waitForLoadState("networkidle");
  await Promise.all([
    mp.waitForURL(`${APP}/moderation?done=approve`),
    mp.click("button:has-text('Approve and publish')"),
  ]);
  check("approval works after reloading the latest version", status(stale) === "approved");

  // ---------- Own post ----------
  await mp.goto(`${APP}/moderation/${own}`, { waitUntil: "networkidle" });
  check(
    "own post: no decision panel",
    (await mp.textContent(".detail__aside"))?.includes("This is your own post") &&
      (await mp.locator("button:has-text('Approve and publish')").count()) === 0,
  );
  await m.ctx.close();

  // ---------- Author side ----------
  const a = await pageFor(author, { width: 390, height: 844 });
  await a.page.goto(`${APP}/my/experiences`, { waitUntil: "networkidle" });
  const ret = a.page.locator(".my-item", { hasText: `Return ${tag}` });
  check(
    "author sees Changes requested with the note",
    (await ret.textContent())?.includes("Changes requested") &&
      (await ret.textContent())?.includes("questions from the technical round"),
  );
  const rej = a.page.locator(".my-item", { hasText: `Reject ${tag}` });
  check(
    "author sees Not accepted with the reason",
    (await rej.textContent())?.includes("Not accepted") &&
      (await rej.textContent())?.includes("confidential assessment"),
  );
  check(
    "rejected post offers no edit",
    (await rej.locator("text=Continue").count()) === 0 &&
      (await rej.locator("text=Edit and resubmit").count()) === 0,
  );
  await ret.locator("text=Edit and resubmit").click();
  await a.page.waitForURL(new RegExp(`/share/${toReturn}`));
  check(
    "returned post opens in the editor with the moderator's note",
    (await a.page.textContent("main"))?.includes("A moderator asked for changes"),
  );
  await a.page.goto(`${APP}/share/${toReject}`);
  check(
    "rejected post cannot be opened for editing",
    a.page.url() === `${APP}/my/experiences`,
    a.page.url(),
  );
  const rej2 = a.page.locator(".my-item", { hasText: `Reject ${tag}` });
  await rej2.locator("summary:has-text('Delete')").click();
  await Promise.all([
    a.page.waitForURL(`${APP}/my/experiences?deleted=1`),
    rej2.locator("button:has-text('Delete')").click(),
  ]);
  check(
    "author can delete a rejected post",
    psql(`select count(*) from public.experiences where id = '${toReject}'`) === "0",
  );
  await a.ctx.close();
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
console.log(`\n${failed() === 0 ? "ALL PASS" : `${failed()} FAILED`} (moderation e2e, local only)`);
process.exit(failed() ? 1 : 0);

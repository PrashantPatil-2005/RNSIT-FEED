// End-to-end checks for comments, helpful votes and reports (F7) in a real browser.
// LOCAL STACK ONLY. Requires the app on http://127.0.0.1:3100, the synthetic demo data
// (npm run test:db), and `npm install --no-save playwright-core@1.64.0`.
// Usage: node scripts/e2e-community.mjs

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

async function pageFor(user, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  if (user) await ctx.addCookies(await sessionCookies(user));
  return { ctx, page: await ctx.newPage() };
}
const helpful = (id) =>
  psql(`select count(*) from public.experience_votes where experience_id = '${id}'`);
const commentId = (body) => psql(`select id from public.comments where body = '${body}'`);
const main = async (p) => (await p.textContent("main")) ?? "";

try {
  const author = createUser("comauthor", { onboard: true });
  const member = createUser("commember", { onboard: true });
  const mod = createUser("commod", { onboard: true });
  users.push(author, member, mod);
  setRole(mod.id, "moderator");

  // Two published posts by the same author: one named, one anonymous.
  const named = submitAs(author.id, { role: `Community Named ${tag}` });
  const anon = submitAs(author.id, { role: `Community Anon ${tag}`, anonymous: true });
  for (const id of [named, anon]) {
    psqlAs(mod.id, `select public.moderate_experience('${id}', 'approve');`);
  }
  const namedUrl = `${APP}/experiences/${named}`;
  const anonUrl = `${APP}/experiences/${anon}`;

  // ---------- Visitor ----------
  const v = await pageFor(null);
  await v.page.goto(namedUrl, { waitUntil: "networkidle" });
  check(
    "visitor: invited to sign in, with a return link",
    (await v.page.locator(`a[href^="/sign-in?next="]`).count()) >= 1 &&
      (await main(v.page)).includes("Sign in with your RNSIT Google account"),
  );
  check(
    "visitor: no vote, comment or report controls",
    (await v.page.locator("button[aria-pressed]").count()) === 0 &&
      (await v.page.locator("#comment-body").count()) === 0 &&
      (await v.page.locator("summary:has-text('Report')").count()) === 0,
  );

  // ---------- Author ----------
  const a = await pageFor(author);
  await a.page.goto(namedUrl, { waitUntil: "networkidle" });
  check(
    "author: cannot vote on or report their own post",
    (await a.page.locator("button[aria-pressed]").count()) === 0 &&
      (await main(a.page)).includes("This is your experience") &&
      (await a.page.locator("summary:has-text('Report this experience')").count()) === 0,
  );
  const authorReply = `Author reply ${tag}`;
  await a.page.goto(anonUrl, { waitUntil: "networkidle" });
  check(
    "anonymous post: author is told their comment shows as Post author",
    (await main(a.page)).includes("will show as “Post author”"),
  );
  let form = a.page.getByRole("form", { name: "Add a comment" });
  await form.locator("textarea[name=body]").fill(authorReply);
  await form.locator("button[type=submit]").click();
  await form.locator(".form__ok").waitFor();
  await a.ctx.close();
  const anonHtml = await (await fetch(anonUrl)).text();
  check(
    "anonymous author's comment is public but shows no name",
    anonHtml.includes(authorReply) && !anonHtml.includes("Synthetic E2E comauthor"),
  );

  // ---------- Member: helpful vote ----------
  const m = await pageFor(member);
  const mp = m.page;
  await mp.goto(namedUrl, { waitUntil: "networkidle" });
  const vote = mp.locator("button[aria-pressed]");
  check(
    "member: vote button starts unpressed",
    (await vote.getAttribute("aria-pressed")) === "false",
  );
  await vote.click();
  await mp.locator("button[aria-pressed='true']").waitFor();
  check(
    "vote counted once",
    helpful(named) === "1" && (await main(mp)).includes("1 member found this helpful"),
  );
  await mp.reload({ waitUntil: "networkidle" });
  check(
    "vote state survives a reload",
    (await mp.locator("button[aria-pressed]").getAttribute("aria-pressed")) === "true",
  );
  await mp.locator("button[aria-pressed]").click();
  await mp.locator("button[aria-pressed='false']").waitFor();
  check("vote can be undone", helpful(named) === "0");
  await mp.locator("button[aria-pressed]").click();
  await mp.locator("button[aria-pressed='true']").waitFor();

  // ---------- Member: comments ----------
  const memberComment = `Member comment ${tag}`;
  form = mp.getByRole("form", { name: "Add a comment" });
  await form.locator("textarea[name=body]").fill("x");
  await form.locator("textarea[name=body]").evaluate((el) => {
    el.removeAttribute("required");
    el.removeAttribute("minlength");
  });
  await form.locator("button[type=submit]").click();
  await form.locator(".form__error").waitFor();
  check(
    "too-short comment refused by the server, text kept",
    (await form.locator(".form__error").textContent())?.includes("Write between") &&
      (await form.locator("textarea[name=body]").inputValue()) === "x",
  );
  await form.locator("textarea[name=body]").fill(memberComment);
  await form.locator("button[type=submit]").click();
  await form.locator(".form__ok").waitFor();
  await waitForFormReset(form, "textarea[name=body]");
  const cid = commentId(memberComment);
  check(
    "comment posted and marked as mine",
    !!cid && (await mp.locator(`#comment-${cid}`).textContent())?.includes("You"),
  );
  check(
    "comment is public with the member's name",
    (await (await fetch(namedUrl)).text()).includes(memberComment),
  );

  const throwaway = `Throwaway ${tag}`;
  await form.locator("textarea[name=body]").fill(throwaway);
  await form.locator("button[type=submit]").click();
  await mp.waitForFunction((t) => document.body.innerText.includes(t), throwaway);
  const tid = commentId(throwaway);
  const own = mp.locator(`#comment-${tid}`);
  await own.locator("summary:has-text('Delete')").click();
  await own.locator("button:has-text('Delete my comment')").click();
  await own.waitFor({ state: "detached" });
  check(
    "member deletes their own comment",
    psql(`select count(*) from public.comments where id = '${tid}'`) === "0",
  );

  // ---------- Member: reports ----------
  await mp.goto(anonUrl, { waitUntil: "networkidle" });
  const replyId = commentId(authorReply);
  const replyRow = mp.locator(`#comment-${replyId}`);
  await replyRow.locator("summary:has-text('Report')").click();
  await replyRow.locator("select[name=reason]").selectOption("defamation");
  await replyRow.locator("textarea[name=details]").fill(`Comment report detail ${tag}`);
  await replyRow.locator("button:has-text('Send report')").click();
  await mp.waitForFunction(() => document.body.innerText.includes("You reported this comment"));
  check(
    "comment reported (once)",
    psql(`select count(*) from public.comment_reports where comment_id = '${replyId}'`) === "1",
  );

  await mp.goto(namedUrl, { waitUntil: "networkidle" });
  await mp.click("summary:has-text('Report this experience')");
  const rf = mp.getByRole("form", { name: "Report this experience" });
  await rf.locator("select[name=reason]").selectOption("personal_info");
  await rf.locator("textarea[name=details]").fill(`Post report detail ${tag}`);
  await rf.locator("button[type=submit]").click();
  await mp.waitForFunction(() => document.body.innerText.includes("You reported this experience"));
  check(
    "experience reported",
    psql(`select count(*) from public.reports where experience_id = '${named}'`) === "1",
  );
  await m.ctx.close();

  // ---------- Moderator: reports queue ----------
  const s = await pageFor(mod);
  const sp = s.page;
  await sp.goto(`${APP}/moderation`, { waitUntil: "networkidle" });
  const repCount = Number(
    (await sp.locator("a[href='/moderation/reports'] .queue-tab__count").textContent()) ?? "0",
  );
  check("queue shows the open report count", repCount >= 2, String(repCount));
  await sp.goto(`${APP}/moderation/reports`, { waitUntil: "networkidle" });
  const reports = await main(sp);
  check(
    "reports list both reports with their details and the reported comment",
    reports.includes(`Post report detail ${tag}`) &&
      reports.includes(`Comment report detail ${tag}`) &&
      reports.includes(authorReply),
  );
  check(
    "reporters are never shown; anonymous author stays hidden",
    !reports.includes("Synthetic E2E commember") && !reports.includes("Synthetic E2E comauthor"),
  );

  const cr = sp.locator("li.my-item", { hasText: `Comment report detail ${tag}` });
  await cr.locator("summary:has-text('Resolve')").click();
  await cr.locator("input[value=remove]").check();
  await cr.locator("button:has-text('Save outcome')").click();
  await cr.locator(".form__error").waitFor();
  check(
    "removing a comment needs a reason",
    (await cr.locator(".form__error").textContent())?.includes("Choose a reason"),
  );
  await cr.locator("select[name=reason]").selectOption("defamation");
  await cr.locator("button:has-text('Save outcome')").click();
  await sp.waitForFunction(
    (t) => !document.body.innerText.includes(t),
    `Comment report detail ${tag}`,
  );
  check(
    "comment removed through its report, and gone from the public page",
    psql(`select status from public.comments where id = '${replyId}'`) === "removed" &&
      !(await (await fetch(anonUrl)).text()).includes(authorReply),
  );
  const ar = await pageFor(author);
  await ar.page.goto(`${APP}/my/experiences`, { waitUntil: "networkidle" });
  const mine = await main(ar.page);
  check(
    "the commenter is told their comment was removed (no reporter or reason shown)",
    mine.includes("Comments removed by moderators") &&
      mine.includes(authorReply) &&
      !mine.includes(`Comment report detail ${tag}`),
  );
  await ar.ctx.close();

  const pr = sp.locator("li.my-item", { hasText: `Post report detail ${tag}` });
  await pr.locator("summary:has-text('Resolve')").click();
  await pr.locator("input[value=dismiss]").check();
  await pr.locator("button:has-text('Save outcome')").click();
  await sp.waitForFunction(
    (t) => !document.body.innerText.includes(t),
    `Post report detail ${tag}`,
  );
  check(
    "post report dismissed, post stays public",
    psql(`select status from public.reports where experience_id = '${named}'`) === "dismissed" &&
      (await fetch(namedUrl)).status === 200,
  );
  await sp.goto(`${APP}/moderation/reports?show=closed`, { waitUntil: "networkidle" });
  check(
    "closed tab lists resolved reports",
    (await main(sp)).includes(`Post report detail ${tag}`) &&
      (await main(sp)).includes("Dismissed"),
  );

  // ---------- Moderator: take down and restore a post; restore a comment ----------
  await sp.goto(`${APP}/moderation/${named}`, { waitUntil: "networkidle" });
  const down = sp.getByRole("form", { name: "Remove from public view" });
  await down.locator("select[name=reason]").selectOption("personal_info");
  await down.locator("button[type=submit]").click();
  await sp.waitForFunction(() => document.body.innerText.includes("Put back"));
  check(
    "published post taken down",
    psql(`select status from public.experiences where id = '${named}'`) === "removed" &&
      (await fetch(namedUrl)).status === 404,
  );
  await sp.goto(`${APP}/moderation?status=removed`, { waitUntil: "networkidle" });
  check("Removed filter lists it", (await main(sp)).includes(`Community Named ${tag}`));
  await sp.goto(`${APP}/moderation/${named}`, { waitUntil: "networkidle" });
  await sp.getByRole("form", { name: "Restore post" }).locator("button[type=submit]").click();
  await sp.waitForFunction(() => document.body.innerText.includes("Take down"));
  check(
    "post restored and public again",
    psql(`select status from public.experiences where id = '${named}'`) === "approved" &&
      (await fetch(namedUrl)).status === 200,
  );

  await sp.goto(`${APP}/moderation/${anon}`, { waitUntil: "networkidle" });
  const removed = sp.locator(`#comment-${replyId}`);
  check(
    "review page shows the removed comment, without the anonymous author's name",
    (await removed.textContent())?.includes("Removed") &&
      (await removed.textContent())?.includes("Post author") &&
      !(await main(sp)).includes("Synthetic E2E comauthor"),
  );
  await removed.locator("summary:has-text('Restore')").click();
  await removed.locator("button:has-text('Restore comment')").click();
  await sp.waitForFunction(
    (sel) => !document.querySelector(sel)?.textContent?.includes("Removed"),
    `#comment-${replyId}`,
  );
  check(
    "comment restored and public again",
    (await (await fetch(anonUrl)).text()).includes(authorReply),
  );
  const hist = (await sp.textContent(".history")) ?? "";
  check(
    "history records the comment removal and restore",
    hist.includes("Comment removed") && hist.includes("Comment restored"),
  );
  await s.ctx.close();

  // ---------- Phone layout ----------
  const ph = await pageFor(member, { width: 360, height: 800 });
  for (const path of [`/experiences/${named}`, `/experiences/${anon}`]) {
    await ph.page.goto(`${APP}${path}`, { waitUntil: "networkidle" });
    const overflow = await ph.page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`360px: ${path} has no horizontal scroll`, overflow <= 0, `overflow ${overflow}px`);
  }
  await ph.ctx.close();
  const pm = await pageFor(mod, { width: 360, height: 800 });
  await pm.page.goto(`${APP}/moderation/reports?show=closed`, { waitUntil: "networkidle" });
  const of2 = await pm.page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("360px: reports page has no horizontal scroll", of2 <= 0, `overflow ${of2}px`);
  await pm.ctx.close();
  await v.ctx.close();
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
console.log(`\n${failed() === 0 ? "ALL PASS" : `${failed()} FAILED`} (community e2e, local only)`);
process.exit(failed() ? 1 : 0);

// End-to-end auth/onboarding checks in a real browser against the LOCAL stack only.
//
// Requires: local Supabase (npx supabase start), the app on http://127.0.0.1:3100 built with the
// .env.local settings, and playwright-core installed WITHOUT saving it to package.json:
//   npm install --no-save playwright-core@1.64.0      (drives the locally installed Edge)
//
// Real Google OAuth cannot run locally (no OAuth client), so a confirmed test account is inserted
// by a privileged SQL statement and signed in through @supabase/ssr with a password, which yields
// the same session cookies the OAuth callback would set. Everything after that goes through the
// real app: proxy, pages, Server Actions and database functions. Test accounts are deleted at the end.
//
// Usage: node scripts/e2e-auth.mjs

import { createRequire } from "node:module";
import {
  APP,
  createChecker,
  createUser,
  deleteUser,
  env,
  psql,
  sessionCookies,
  waitForApp,
} from "./lib/local.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const { check, failed: failedCount } = createChecker();
await waitForApp();

const browser = await chromium.launch({ channel: "msedge", headless: true });
const users = [];
try {
  // ---------- Visitors ----------
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${APP}/account`);
  check(
    "visitor: /account redirects to sign-in with next",
    page.url() === `${APP}/sign-in?next=%2Faccount`,
    page.url(),
  );
  await page.goto(`${APP}/onboarding`);
  check(
    "visitor: /onboarding redirects to sign-in",
    page.url().startsWith(`${APP}/sign-in`),
    page.url(),
  );
  check(
    "header shows Sign in for visitors",
    await page.locator(".header-actions >> text=Sign in").isVisible(),
  );
  // The button must reflect the Auth server's real setting, whichever way it is configured.
  const googleOn =
    (
      await (
        await fetch(`${env.API_URL}/auth/v1/settings`, { headers: { apikey: env.ANON_KEY } })
      ).json()
    ).external?.google === true;
  const googleBtn = page.locator("button:has-text('Continue with Google')");
  const mainText = (await page.textContent("main")) ?? "";
  check(
    `Google button ${googleOn ? "enabled" : "disabled"} (provider ${googleOn ? "on" : "off"})`,
    (await googleBtn.isDisabled()) === !googleOn,
  );
  check(
    `"not configured" note ${googleOn ? "absent" : "shown"} accordingly`,
    mainText.includes("not configured in this environment") === !googleOn,
  );
  const banner = (await page.textContent(".status-banner")) ?? "";
  check(
    `site banner says sign-in is ${googleOn ? "open" : "not available"}`,
    googleOn
      ? banner.includes("Sign in with your @rnsit.ac.in Google account")
      : banner.includes("Sign-in and posting are not available yet"),
  );

  // ---------- Open-redirect protection (sign-in next parameter) ----------
  for (const evil of [
    "//evil.example/x",
    "https://evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/auth/callback?code=x",
  ]) {
    await page.goto(`${APP}/sign-in?next=${encodeURIComponent(evil)}`);
    const v = await page.inputValue('input[name="next"]');
    check(`unsafe next rejected: ${evil}`, v === "", v);
  }
  await page.goto(`${APP}/sign-in?next=${encodeURIComponent("/experiences?type=internship")}`);
  check(
    "safe next kept",
    (await page.inputValue('input[name="next"]')) === "/experiences?type=internship",
  );

  // ---------- Callback error handling ----------
  const cases = [
    [
      "?error=access_denied&error_description=Sign-up%20is%20not%20allowed%20for%20this%20email%20address.",
      "not_eligible",
      "This account cannot join",
    ],
    [
      "?error=access_denied&error_description=User%20cancelled",
      "oauth_cancelled",
      "Sign-in was cancelled",
    ],
    [
      "?error=server_error&error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
      "oauth_failed",
      "Sign-in did not complete",
    ],
    ["", "missing_code", "Sign-in link is incomplete"],
    ["?code=not-a-real-code", "exchange_failed", "expired or was already used"],
  ];
  for (const [qs, code, text] of cases) {
    await page.goto(`${APP}/auth/callback${qs}`);
    const body = (await page.textContent("main")) ?? "";
    check(
      `callback ${code || "error"} -> fixed message`,
      page.url().endsWith(`/auth/error?code=${code}`) && body.includes(text),
      `${page.url()} | ${body.slice(0, 80)}`,
    );
    check(
      `callback ${code}: provider text not reflected`,
      !(await page.content()).includes("<script>alert(1)"),
    );
  }
  await page.goto(`${APP}/auth/error?code=%3Cimg%20src%3Dx%3E`);
  check(
    "unknown error code shows generic message only",
    (await page.textContent("main"))?.includes("Sign-in did not complete") &&
      !(await page.content()).includes("<img src=x>"),
  );
  await ctx.close();

  // ---------- New member: onboarding ----------
  const a = createUser("onboard");
  users.push(a);
  const actx = await browser.newContext();
  const aCookies = await sessionCookies(a);
  const aSession = JSON.parse(
    Buffer.from(
      aCookies.find((c) => c.value.startsWith("base64-")).value.slice(7),
      "base64url",
    ).toString(),
  );
  await actx.addCookies(aCookies);
  const ap = await actx.newPage();
  await ap.goto(`${APP}/account`);
  check(
    "signed-in, not onboarded: /account redirects to onboarding",
    ap.url().startsWith(`${APP}/onboarding`),
    ap.url(),
  );
  check(
    "header offers Finish setup",
    await ap.locator(".header-actions >> text=Finish setup").isVisible(),
  );
  check(
    "name shown read-only from Google",
    (await ap.textContent("main"))?.includes("Synthetic E2E onboard") &&
      (await ap.locator('input[name="full_name"], input[name="name"]').count()) === 0,
  );
  check("no role field in onboarding", (await ap.locator('[name="role"]').count()) === 0);

  // Invalid USN
  await ap.selectOption("#department", { index: 1 });
  await ap.selectOption("#batch", { index: 1 });
  await ap.fill("#usn", "12345");
  await ap.check("#consent");
  await ap.click("button:has-text('Finish setting up')");
  await ap.waitForSelector(".form__error");
  check(
    "invalid USN shows inline format error",
    (await ap.textContent(".form__error"))?.includes("format 1RN23CS001"),
  );
  check("USN field marked invalid", (await ap.getAttribute("#usn", "aria-invalid")) === "true");

  // Duplicate USN (held by the synthetic seed user Alice)
  await ap.fill("#usn", "1rn00zz001");
  await ap.click("button:has-text('Finish setting up')");
  await ap.waitForFunction(() =>
    document.querySelector(".form__error")?.textContent?.includes("already linked"),
  );
  const dupText = (await ap.textContent(".form__error")) ?? "";
  check(
    "duplicate USN refused without revealing the holder",
    dupText.includes("already linked") && !/Alice|1RN00ZZ001/i.test(dupText),
  );

  // Missing consent
  const usn = `1RN00ZZ${String(600 + (Date.now() % 400)).padStart(3, "0")}`;
  await ap.fill("#usn", ` ${usn.toLowerCase()} `);
  await ap.uncheck("#consent");
  await ap.click("button:has-text('Finish setting up')");
  await ap.waitForFunction(() =>
    document.querySelector(".form__error")?.textContent?.includes("confirm"),
  );
  check("consent required", true);

  // Success
  await ap.check("#consent");
  await Promise.all([
    ap.waitForURL(`${APP}/account`),
    ap.click("button:has-text('Finish setting up')"),
  ]);
  const acct = (await ap.textContent("main")) ?? "";
  check("onboarding completes and lands on /account", ap.url() === `${APP}/account`);
  check(
    "USN masked by default",
    acct.includes(`${usn.slice(0, 7)}•••`) && !(await ap.locator(".reveal .mono").isVisible()),
  );
  await ap.click(".reveal summary");
  check(
    "owner can reveal their own USN (normalised)",
    (await ap.textContent(".reveal .mono")) === usn,
  );
  check("role shown as Student", acct.includes("Student"));
  check(
    "header shows the member's first name",
    await ap.locator(".header-actions >> text=Synthetic").isVisible(),
  );
  await ap.goto(`${APP}/onboarding`);
  check("onboarding cannot be repeated", ap.url() === `${APP}/account`, ap.url());
  check(
    "USN never appears on public pages",
    !(await (await fetch(`${APP}/experiences`)).text()).includes(usn),
  );
  check(
    "database stored the normalised USN",
    psql(`select usn from private.profile_private where user_id = '${a.id}'`) === usn,
  );
  check(
    "role is still student in the database",
    psql(`select role from public.profiles where id = '${a.id}'`) === "student",
  );

  // ---------- Another member cannot see A's USN ----------
  const b = createUser("other");
  users.push(b);
  const bctx = await browser.newContext();
  await bctx.addCookies(await sessionCookies(b));
  const bp = await bctx.newPage();
  await bp.goto(`${APP}/onboarding`);
  check(
    "second member sees their own onboarding, not A's data",
    !(await bp.content()).includes(usn) &&
      (await bp.textContent("main"))?.includes("Synthetic E2E other"),
  );
  await bctx.close();

  // ---------- Session refresh writes hardened cookies ----------
  const rctx = await browser.newContext();
  await rctx.addCookies(await sessionCookies(a, { expireAccessToken: true }));
  const rp = await rctx.newPage();
  await rp.goto(`${APP}/account`);
  check(
    "expired access token is refreshed (still signed in)",
    rp.url() === `${APP}/account`,
    rp.url(),
  );
  const auth = (await rctx.cookies()).filter(
    (c) => c.name.startsWith("sb-") && c.name.includes("auth-token"),
  );
  check(
    "refreshed session cookies are httpOnly",
    auth.length > 0 && auth.every((c) => c.httpOnly),
    JSON.stringify(auth.map((c) => [c.name, c.httpOnly])),
  );
  check(
    "refreshed session cookies are SameSite=Lax",
    auth.every((c) => c.sameSite === "Lax"),
  );
  await rctx.close();

  // ---------- Sign out ----------
  await Promise.all([
    ap.waitForURL(`${APP}/?signed_out=1`),
    ap.click(".header-actions button:has-text('Sign out')"),
  ]);
  const left = (await actx.cookies()).filter(
    (c) => c.name.startsWith("sb-") && c.name.includes("auth-token"),
  );
  check(
    "header shows Sign in right after sign-out (no reload)",
    await ap.locator(".header-actions >> text=Sign in").isVisible(),
  );
  check(
    "sign-out clears the session cookies",
    left.length === 0,
    JSON.stringify(left.map((c) => c.name)),
  );
  await ap.goto(`${APP}/account`);
  check(
    "after sign-out /account requires sign-in again",
    ap.url().startsWith(`${APP}/sign-in`),
    ap.url(),
  );
  // The browser's session was refreshed during the test, so check the server revoked the family:
  // the original refresh token must no longer mint a session.
  const reuse = await fetch(`${env.API_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: env.ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: aSession.refresh_token }),
  });
  check("signed-out refresh token cannot be reused", reuse.status >= 400, String(reuse.status));
  await actx.close();

  // ---------- Forged session cookie is not trusted ----------
  const fctx = await browser.newContext();
  const forged = Buffer.from(
    JSON.stringify({
      access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.bad",
      refresh_token: "nope",
      expires_at: 9999999999,
      token_type: "bearer",
      user: { id: a.id, role: "authenticated" },
    }),
  ).toString("base64url");
  await fctx.addCookies([
    { name: "sb-127-auth-token", value: `base64-${forged}`, domain: "127.0.0.1", path: "/" },
  ]);
  const fp = await fctx.newPage();
  await fp.goto(`${APP}/account`);
  check(
    "forged session cookie is rejected (getUser verifies with Auth)",
    fp.url().startsWith(`${APP}/sign-in`),
    fp.url(),
  );
  await fctx.close();
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
console.log(
  `\n${failedCount() === 0 ? "ALL PASS" : `${failedCount()} FAILED`} (auth e2e, local only)`,
);
process.exit(failedCount() ? 1 : 0);

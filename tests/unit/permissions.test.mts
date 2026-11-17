// Unit tests for role home pages, staff links and the post-sign-in destination (plan P1, D-R1).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  homeForRole,
  roleAbilities,
  STAFF_LINKS,
  staffLinksFor,
} from "../../src/lib/auth/permissions.ts";
import { postSignInPath } from "../../src/lib/auth/redirect.ts";

const ROLES = ["student", "alumni", "moderator", "admin"] as const;

test("each role has its own home page", () => {
  assert.equal(homeForRole("student"), "/");
  assert.equal(homeForRole("alumni"), "/");
  assert.equal(homeForRole("moderator"), "/moderation");
  assert.equal(homeForRole("admin"), "/admin");
  assert.equal(homeForRole(null), "/");
  assert.equal(homeForRole(undefined), "/");
});

test("students and alumni get no staff links", () => {
  assert.deepEqual(staffLinksFor("student"), []);
  assert.deepEqual(staffLinksFor("alumni"), []);
  assert.deepEqual(staffLinksFor(null), []);
  assert.deepEqual(staffLinksFor(undefined), []);
});

test("moderators get moderation links only, never admin links", () => {
  const hrefs = staffLinksFor("moderator").map((l) => l.href);
  assert.deepEqual(hrefs, ["/moderation", "/moderation/reports"]);
  assert.ok(hrefs.every((h) => !h.startsWith("/admin")));
});

test("admins get every staff link", () => {
  assert.deepEqual(
    staffLinksFor("admin").map((l) => l.href),
    STAFF_LINKS.map((l) => l.href),
  );
});

test("every role has an abilities summary; only staff mention moderation", () => {
  for (const r of ROLES) assert.ok(roleAbilities[r].length >= 3, r);
  const mentions = (r: (typeof ROLES)[number]) =>
    roleAbilities[r].some((a) => /pending posts|moderator/i.test(a));
  assert.equal(mentions("student"), false);
  assert.equal(mentions("alumni"), false);
  assert.equal(mentions("moderator"), true);
  assert.equal(mentions("admin"), true);
});

test("postSignInPath: explicit safe next wins over the role home", () => {
  assert.equal(postSignInPath("/share", "/admin"), "/share");
  assert.equal(postSignInPath("/experiences?type=internship", "/"), "/experiences?type=internship");
});

test("postSignInPath: missing next falls back to the role home", () => {
  for (const raw of [null, undefined, "", "   "]) {
    assert.equal(postSignInPath(raw, "/moderation"), "/moderation");
  }
});

test("postSignInPath: unsafe next falls back to the role home, never off-site", () => {
  for (const raw of [
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/auth/callback?code=x",
  ]) {
    assert.equal(postSignInPath(raw, "/admin"), "/admin", raw);
  }
});

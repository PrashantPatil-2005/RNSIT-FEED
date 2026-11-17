// Unit tests for redirect safety and OAuth error classification.
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyOAuthError, isAuthErrorCode } from "../../src/lib/auth/errors.ts";
import { safeNextPath } from "../../src/lib/auth/redirect.ts";

test("safeNextPath rejects every off-site or tricky destination", () => {
  const bad = [
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "https://evil.example",
    "http:/evil.example",
    "javascript:alert(1)",
    "data:text/html,x",
    "evil.example",
    "",
    " ",
    "/\u0000x",
    "/a\nb",
    "/auth/callback?code=x",
    "/auth/error",
    "/" + "a".repeat(250),
    null,
    undefined,
    42,
    ["/account"],
  ];
  for (const v of bad) assert.equal(safeNextPath(v), "/account", JSON.stringify(v));
});

test("safeNextPath keeps same-site paths and query strings", () => {
  assert.equal(safeNextPath("/experiences?type=internship"), "/experiences?type=internship");
  assert.equal(safeNextPath("/share"), "/share");
  assert.equal(safeNextPath("/companies/acme#top"), "/companies/acme");
  assert.equal(safeNextPath("/x", "/home"), "/x");
  assert.equal(safeNextPath("//x", "/home"), "/home");
});

test("classifyOAuthError maps provider/database errors to fixed codes", () => {
  assert.equal(
    classifyOAuthError("access_denied", "Sign-up is not allowed for this email address."),
    "not_eligible",
  );
  assert.equal(
    classifyOAuthError("server_error", "Database error saving new user"),
    "not_eligible",
  );
  assert.equal(classifyOAuthError("access_denied", "User cancelled the login"), "oauth_cancelled");
  assert.equal(
    classifyOAuthError("validation_failed", "Unsupported provider: provider is not enabled"),
    "provider_unavailable",
  );
  assert.equal(classifyOAuthError("server_error", "<script>alert(1)</script>"), "oauth_failed");
  assert.equal(classifyOAuthError("weird", null), "oauth_failed");
});

test("isAuthErrorCode accepts only known codes", () => {
  assert.ok(isAuthErrorCode("not_eligible"));
  for (const v of ["<img>", "toString", "__proto__", "", null, 1])
    assert.equal(isAuthErrorCode(v), false);
});

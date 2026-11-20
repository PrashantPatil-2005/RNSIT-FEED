// Unit tests for the one-origin redirect (sign-in cookies and the OAuth callback share a host).
import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalRedirectUrl } from "../../src/lib/canonical-host.ts";

const prod = new URL("https://www.rnsitfeed.in");
const local = new URL("http://127.0.0.1:3100");

test("other production hosts go to the canonical host, keeping path and query", () => {
  for (const host of ["rnsitfeed.vercel.app", "rnsitfeed.in"]) {
    const url = canonicalRedirectUrl({
      host,
      pathname: "/experiences",
      search: "?company=x",
      site: prod,
      vercelEnv: "production",
    });
    assert.equal(url?.href, "https://www.rnsitfeed.in/experiences?company=x");
  }
});

test("the canonical host itself is never redirected (no loop)", () => {
  assert.equal(
    canonicalRedirectUrl({ host: "www.rnsitfeed.in", pathname: "/", search: "", site: prod }),
    null,
  );
  assert.equal(
    canonicalRedirectUrl({ host: "WWW.RNSITFEED.IN", pathname: "/", search: "", site: prod }),
    null,
  );
  assert.equal(
    canonicalRedirectUrl({ host: "127.0.0.1:3100", pathname: "/", search: "", site: local }),
    null,
  );
});

test("localhost goes to 127.0.0.1 locally", () => {
  const url = canonicalRedirectUrl({
    host: "localhost:3100",
    pathname: "/sign-in",
    search: "?next=%2Fshare",
    site: local,
  });
  assert.equal(url?.href, "http://127.0.0.1:3100/sign-in?next=%2Fshare");
});

test("previews and missing configuration are left alone", () => {
  const base = { host: "rnsitfeed-git-x.vercel.app", pathname: "/", search: "" };
  assert.equal(canonicalRedirectUrl({ ...base, site: prod, vercelEnv: "preview" }), null);
  assert.equal(canonicalRedirectUrl({ ...base, site: null }), null);
  assert.equal(canonicalRedirectUrl({ ...base, host: null, site: prod }), null);
});

test("a crafted path cannot change the destination origin", () => {
  const url = canonicalRedirectUrl({
    host: "rnsitfeed.vercel.app",
    pathname: "//evil.example/x",
    search: "",
    site: prod,
  });
  assert.equal(url?.origin, "https://www.rnsitfeed.in");
});

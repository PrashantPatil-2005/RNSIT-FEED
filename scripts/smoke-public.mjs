// Smoke test for the public pages against a running app (default http://127.0.0.1:3100) backed by
// the LOCAL Supabase stack with the synthetic demo data (supabase/dev/demo_seed.sql).
// Usage: node scripts/smoke-public.mjs [baseUrl]

const base = process.argv[2] ?? "http://127.0.0.1:3100";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) {
  console.error("Refusing to run against a non-local URL.");
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n      ${detail}`}`);
};

async function get(path) {
  const res = await fetch(base + path, { redirect: "manual" });
  return {
    status: res.status,
    location: res.headers.get("location"),
    headers: res.headers,
    html: await res.text(),
  };
}

// Wait for the server (up to ~30 s).
for (let i = 0; i < 60; i++) {
  try {
    await fetch(base);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}

const home = await get("/");
check("home renders", home.status === 200 && home.html.includes("Recently published experiences"));
check("home lists demo experiences", home.html.includes("Software Engineer (demo)"));
check(
  "security headers present",
  home.headers.get("x-frame-options") === "DENY" &&
    home.headers.get("x-content-type-options") === "nosniff",
);
check(
  "site stays noindex (O-6)",
  /<meta name="robots" content="noindex, ?nofollow"/.test(home.html),
);

const feed = await get("/experiences");
check("feed renders", feed.status === 200 && feed.html.includes("Placement experiences"));
const ids = [...feed.html.matchAll(/href="\/experiences\/([0-9a-f-]{36})"/g)].map((m) => m[1]);
check("feed links to experience pages", ids.length >= 5, `found ${ids.length}`);

const filtered = await get("/experiences?type=internship");
check(
  "opportunity filter narrows results",
  filtered.html.includes("Data Analyst Intern (demo)") &&
    !filtered.html.includes("Systems Engineer (demo)"),
);
const byRound = await get("/experiences?round=gd");
check(
  "round-type filter",
  byRound.html.includes("Data Analyst Intern (demo)") &&
    !byRound.html.includes("Product Engineer (demo)"),
);
const text = await get("/experiences?q=LRU");
check(
  "full-text search finds question text",
  text.html.includes("Product Engineer (demo)") && !text.html.includes("Systems Engineer (demo)"),
);
const none = await get("/experiences?q=zzzznomatch");
check("empty result state", none.html.includes("No experiences match these filters"));
const bad = await get("/experiences?dept=%3Cscript%3E&batch=abc&type=evil&page=-4");
check(
  "malformed filters are ignored, not errors",
  bad.status === 200 && !bad.html.includes("<script>alert"),
);
const xss = await get("/experiences?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
check(
  "search text is escaped (no reflected XSS)",
  xss.status === 200 && !xss.html.includes("<script>alert(1)</script>"),
);
const unknownCo = await get("/experiences?company=does-not-exist");
check(
  "unknown company filter yields empty state",
  unknownCo.html.includes("No experiences match these filters"),
);

const search = await get("/search?q=LRU&type=both");
check(
  "/search redirects to /experiences with filters",
  [307, 308].includes(search.status) && search.location?.includes("/experiences?q=LRU&type=both"),
  `${search.status} ${search.location}`,
);

// Detail pages: find the named and the anonymous demo posts
let named, anon;
for (const id of ids) {
  const d = await get(`/experiences/${id}`);
  if (d.html.includes("Software Engineer (demo)")) named = d;
  if (d.html.includes("Systems Engineer (demo)")) anon = d;
}
check(
  "detail page renders rounds and questions",
  !!named && named.html.includes("Questions asked") && named.html.includes("longest substring"),
);
check("named author shown", !!named && named.html.includes("Synthetic Alice"));
check(
  "comments and helpful count shown",
  !!named &&
    named.html.includes("thanks, this helped") &&
    named.html.includes("found this helpful"),
);
check(
  "resource link is rel=nofollow noopener",
  !!named && /rel="nofollow noopener noreferrer ugc"/.test(named.html),
);
check(
  "anonymous post hides the author",
  !!anon && anon.html.includes("an anonymous member") && !anon.html.includes("Synthetic Alice"),
);
check(
  "no USN-shaped text on detail pages",
  ![named, anon].some((d) => d && /1RN\d{2}[A-Z]{2}\d{3}/.test(d.html)),
);

const missing = await get("/experiences/00000000-0000-4000-8000-000000000000");
check("unknown experience is 404", missing.status === 404);
const junk = await get("/experiences/not-a-uuid");
check("malformed id is 404 (no DB error)", junk.status === 404);

const companies = await get("/companies");
check(
  "companies page renders with counts",
  companies.status === 200 &&
    companies.html.includes("Initech (demo)") &&
    /2 experiences/.test(companies.html.replace(/<!-- -->/g, "")),
);
const company = await get("/companies/initech-demo");
check(
  "company page shows stats and its posts only",
  company.status === 200 &&
    company.html.includes("Average difficulty") &&
    company.html.includes("Data Analyst Intern (demo)") &&
    !company.html.includes("Product Engineer (demo)"),
);
const companyBad = await get("/companies/NOT_A_SLUG");
check("invalid company slug is 404", companyBad.status === 404);

for (const p of ["/guidelines", "/disclaimer", "/privacy", "/sign-in", "/share"]) {
  const r = await get(p);
  check(`static page ${p}`, r.status === 200);
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passed, ${failed} failed (public pages).`);
process.exit(failed ? 1 : 0);

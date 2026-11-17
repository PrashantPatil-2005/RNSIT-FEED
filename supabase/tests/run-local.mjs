// Runs the migrations and the SQL tests on a throwaway in-memory Postgres (PGlite, WebAssembly).
// It never connects to Supabase and never touches a live database.
//
// One-off setup, without changing package.json:   npm install --no-save @electric-sql/pglite
// Run:                                            node supabase/tests/run-local.mjs
//
// Limits: PGlite is real Postgres but NOT Supabase. The auth schema and roles are emulated by
// support/00_local_stub.sql. Re-run the same SQL with `supabase test db` against a local
// Supabase stack (Docker) before trusting results for production.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let PGlite, pg_trgm;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
  ({ pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm"));
} catch {
  console.error("Missing dependency. Run: npm install --no-save @electric-sql/pglite");
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(root, ...p), "utf8");
const list = (...p) =>
  readdirSync(join(root, ...p))
    .filter((f) => f.endsWith(".sql"))
    .sort();

const db = new PGlite({ extensions: { pg_trgm } });
const only = process.argv[2]; // optional substring filter for test files

async function step(label, sql) {
  try {
    await db.exec(sql);
  } catch (error) {
    console.error(`\nSETUP FAILED in ${label}:\n${error.message}`);
    process.exit(1);
  }
}

await step("support/00_local_stub.sql", read("tests", "support", "00_local_stub.sql"));
for (const file of list("migrations")) {
  await step(`migrations/${file}`, read("migrations", file));
}
console.log(`Applied ${list("migrations").length} migrations to a throwaway local database.`);
await step("support/10_seed_synthetic.sql", read("tests", "support", "10_seed_synthetic.sql"));

let passed = 0;
const failures = [];
for (const file of list("tests", "database")) {
  if (only && !file.includes(only)) continue;
  try {
    await db.exec(read("tests", "database", file));
    passed += 1;
    console.log(`PASS  ${file}`);
  } catch (error) {
    failures.push(file);
    console.log(`FAIL  ${file}\n      ${error.message.split("\n")[0]}`);
    try {
      await db.exec("rollback");
    } catch {}
  }
}
console.log(`\n${passed} passed, ${failures.length} failed.`);
process.exit(failures.length ? 1 : 0);

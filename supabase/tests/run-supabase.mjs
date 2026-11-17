// Runs the SQL test suite against a REAL LOCAL Supabase stack (`npx supabase start`).
// It refuses to run against anything except the local Docker container, and it never connects to a
// hosted project.
//
// What it does:
//   1. `supabase db reset --local`  -> fresh database with all migrations applied by the Supabase CLI
//   2. loads the test helpers and the synthetic seed (support/05_supabase_helpers.sql, 10_seed_synthetic.sql)
//   3. runs every supabase/tests/database/*.test.sql file with psql inside the database container
//
// Usage: node supabase/tests/run-supabase.mjs [substring-filter] [--no-reset]

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const noReset = args.includes("--no-reset");
const only = args.find((a) => !a.startsWith("--"));

const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(
  readFileSync(join(root, "config.toml"), "utf8"),
)?.[1];
if (!projectId) {
  console.error("project_id not found in supabase/config.toml");
  process.exit(2);
}
const container = `supabase_db_${projectId}`;

function psql(sql, label) {
  const res = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8" },
  );
  if (res.error) throw res.error;
  return { ok: res.status === 0, out: `${res.stdout}${res.stderr}`.trim(), label };
}

// Safety: the container must exist locally.
try {
  execFileSync("docker", ["inspect", container], { stdio: "ignore" });
} catch {
  console.error(`Local container ${container} is not running. Start it with: npx supabase start`);
  process.exit(2);
}

if (!noReset) {
  console.log("Resetting the LOCAL database (supabase db reset --local)...");
  const r = spawnSync("npx", ["supabase", "db", "reset", "--local"], {
    cwd: join(root, ".."),
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(`db reset failed:\n${r.stdout}\n${r.stderr}`);
    process.exit(1);
  }
}

for (const f of ["05_supabase_helpers.sql", "10_seed_synthetic.sql"]) {
  const r = psql(readFileSync(join(root, "tests", "support", f), "utf8"), f);
  if (!r.ok) {
    console.error(`SETUP FAILED in ${f}:\n${r.out}`);
    process.exit(1);
  }
}

const files = readdirSync(join(root, "tests", "database"))
  .filter((f) => f.endsWith(".sql") && (!only || f.includes(only)))
  .sort();
let passed = 0;
const failed = [];
for (const f of files) {
  const r = psql(readFileSync(join(root, "tests", "database", f), "utf8"), f);
  if (r.ok) {
    passed += 1;
    console.log(`PASS  ${f}`);
  } else {
    failed.push(f);
    const msg = r.out.split("\n").find((l) => /ERROR/.test(l)) ?? r.out.split("\n")[0];
    console.log(`FAIL  ${f}\n      ${msg}`);
  }
}
console.log(
  `\n${passed} passed, ${failed.length} failed (real local Supabase, container ${container}).`,
);
process.exit(failed.length ? 1 : 0);

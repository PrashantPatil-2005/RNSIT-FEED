// Loads the synthetic demo data (supabase/dev/demo_seed.sql) into the LOCAL Supabase stack.
// Idempotent: skips if the demo posts already exist. The seed runs in one transaction, so a failure
// leaves nothing behind. Requires the test helpers from `npm run test:db` (it resets the database).
// Usage: node scripts/seed-demo.mjs

import { readFileSync } from "node:fs";
import { DEMO_COMPANY, hasDemoData, psql } from "./lib/local.mjs";

if (psql("select to_regprocedure('test.alice()') is not null") !== "t") {
  console.error("Test helpers are missing. Run `npm run test:db` first (it resets the database).");
  process.exit(2);
}
if (hasDemoData()) {
  console.log(`Demo data already present (${DEMO_COMPANY}); nothing to do.`);
} else {
  psql(readFileSync("supabase/dev/demo_seed.sql", "utf8"));
  if (!hasDemoData()) {
    console.error("Demo seed ran but no demo posts were found.");
    process.exit(1);
  }
  console.log("Demo data loaded.");
}

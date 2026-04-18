// Drops all app tables and re-applies db/schema.sql from scratch.
// Dev-only utility: do NOT run against production.
// Usage: npm run reset-db

import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import postgres from "postgres";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const TABLES = [
  "score_logs",
  "scores",
  "games",
  "students",
  "events",
  "teacher_sessions",
  "login_alerts",
  "settings",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  if (/prod/i.test(url)) {
    throw new Error("Refusing to reset: DATABASE_URL looks like production.");
  }

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    for (const t of TABLES) {
      await sql.unsafe(`drop table if exists ${t} cascade`);
    }
    console.log(`✓ dropped ${TABLES.length} tables`);
    const schema = readFileSync("db/schema.sql", "utf8");
    await sql.unsafe(schema);
    console.log("✓ re-applied db/schema.sql");
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

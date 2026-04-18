// Quick Supabase/Postgres connectivity check.
// Usage: npx tsx scripts/check-db.ts
// Reports: connection, server version, schema presence, row counts.

import { config as loadEnv } from "dotenv";
import postgres from "postgres";

// Match Next.js precedence: .env.local overrides .env
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const REQUIRED_TABLES = [
  "events",
  "games",
  "students",
  "scores",
  "score_logs",
  "teacher_sessions",
  "login_alerts",
  "settings",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("✗ DATABASE_URL is not set. Create .env.local from .env.example first.");
    process.exit(1);
  }

  const hostMatch = url.match(/@([^/:]+)/);
  console.log(`→ host: ${hostMatch?.[1] ?? "(unknown)"}`);
  const portMatch = url.match(/:(\d+)\//);
  const port = portMatch?.[1];
  console.log(`→ port: ${port ?? "(unknown)"}`);
  if (port && port !== "6543") {
    console.warn(`  ⚠ expected 6543 (Supabase Transaction pooler) — current: ${port}`);
  }

  const sql = postgres(url, { prepare: false, idle_timeout: 5, max: 1 });

  try {
    const [{ version }] = await sql<{ version: string }[]>`select version()`;
    console.log(`✓ connected: ${version.split(",")[0]}`);

    const tables = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any(${sql.array(REQUIRED_TABLES)})
    `;
    const found = new Set(tables.map((t) => t.table_name));
    const missing = REQUIRED_TABLES.filter((t) => !found.has(t));
    if (missing.length) {
      console.warn(`✗ missing tables: ${missing.join(", ")}`);
      console.warn("  → run db/schema.sql in the Supabase SQL Editor.");
    } else {
      console.log(`✓ all ${REQUIRED_TABLES.length} tables present`);
    }

    if (missing.length === 0) {
      const counts = await sql<{ table: string; n: number }[]>`
        select 'events' as table, count(*)::int as n from events
        union all select 'games', count(*)::int from games
        union all select 'students', count(*)::int from students
        union all select 'scores', count(*)::int from scores
      `;
      console.log("→ row counts:");
      for (const { table, n } of counts) console.log(`   ${table.padEnd(10)} ${n}`);
    }
  } catch (err) {
    console.error("✗ query failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main();

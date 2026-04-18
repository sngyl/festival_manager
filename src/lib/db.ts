import postgres, { type Sql } from "postgres";

type GlobalWithSql = typeof globalThis & { __festival_sql?: Sql };
const g = globalThis as GlobalWithSql;

export function getSql(): Sql {
  if (g.__festival_sql) return g.__festival_sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Use the Supabase pooler URL (port 6543).");
  }
  g.__festival_sql = postgres(url, {
    prepare: false,
    idle_timeout: 20,
    max: 10,
  });
  return g.__festival_sql;
}

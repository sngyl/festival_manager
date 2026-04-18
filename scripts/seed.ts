// Seed sample data for local UI verification.
// Usage: npm run seed
// Idempotent-ish: if an event with the same name exists, it is reused.

import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import bcrypt from "bcryptjs";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const EVENT_NAME = "2026 봄 체육대회";
const GAMES = ["제기차기", "퀴즈왕", "줄다리기", "이어달리기"];
const TEACHER_PASSWORD = "123456";

// grade → { classNo → number of students }
const ROSTER: Record<number, Record<number, number>> = {
  1: { 1: 6, 2: 5, 3: 6 },
  2: { 1: 5, 2: 6, 3: 5 },
  3: { 1: 4, 2: 5 },
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const makeSid = (g: number, c: number, n: number) => `${g}${pad2(c)}${pad2(n)}`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    await sql`update events set active = false`;
    const existing = await sql<{ id: string }[]>`
      select id from events where name = ${EVENT_NAME} limit 1
    `;
    const eventId =
      existing[0]?.id ??
      (
        await sql<{ id: string }[]>`
          insert into events (name, active) values (${EVENT_NAME}, true)
          returning id
        `
      )[0].id;
    await sql`update events set active = true where id = ${eventId}`;
    console.log(`✓ event: ${EVENT_NAME} (${eventId})`);

    const gameIds: Record<string, string> = {};
    for (const name of GAMES) {
      const rows = await sql<{ id: string }[]>`
        insert into games (event_id, name) values (${eventId}, ${name})
        on conflict (event_id, name) do update set name = excluded.name
        returning id
      `;
      gameIds[name] = rows[0].id;
    }
    console.log(`✓ games: ${GAMES.join(", ")}`);

    const sids: string[] = [];
    for (const [gradeStr, classes] of Object.entries(ROSTER)) {
      const grade = Number(gradeStr);
      for (const [classStr, count] of Object.entries(classes)) {
        const classNo = Number(classStr);
        for (let studentNo = 1; studentNo <= count; studentNo++) {
          const sid = makeSid(grade, classNo, studentNo);
          sids.push(sid);
          await sql`
            insert into students (sid, grade, class_no, student_no)
            values (${sid}, ${grade}, ${classNo}, ${studentNo})
            on conflict (sid) do update set grade = excluded.grade, class_no = excluded.class_no, student_no = excluded.student_no
          `;
        }
      }
    }
    console.log(`✓ students: ${sids.length}`);

    // Deterministic pseudo-random scores
    const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
    let scoreCount = 0;
    for (const sid of sids) {
      for (const gameName of GAMES) {
        if ((hash(sid + gameName) & 3) === 0) continue; // ~25% skip
        const points = 10 + (((hash(sid + gameName) >>> 2) & 0xff) % 91); // 10..100
        await sql`
          insert into scores (event_id, game_id, sid, points, created_by)
          values (${eventId}, ${gameIds[gameName]}, ${sid}, ${points}, ${"seed"})
          on conflict (event_id, game_id, sid) do update
            set points = excluded.points, updated_at = now()
        `;
        scoreCount++;
      }
    }
    console.log(`✓ scores: ${scoreCount}`);

    const pwHash = await bcrypt.hash(TEACHER_PASSWORD, 10);
    await sql`
      insert into settings (key, value) values ('teacher_password_hash', ${pwHash})
      on conflict (key) do update set value = excluded.value
    `;
    console.log(`✓ teacher password: ${TEACHER_PASSWORD}`);

    console.log("\nDone. Run `npm run dev` and open http://localhost:3000");
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

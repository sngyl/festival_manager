# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Source of truth

[PRD.md](PRD.md) is the product spec. Read it before implementing or modifying behavior — this file only captures the *non-obvious* decisions a future Claude instance would otherwise have to reconstruct from multiple sections.

## Stack (scaffolded)

- **Next.js 16** App Router, TypeScript, `src/` layout, import alias `@/*`
- **React 19**, **Tailwind CSS v4**
- **Supabase Postgres** accessed via the `postgres` npm package (Porsager). The DB client lives at [src/lib/db.ts](src/lib/db.ts) as a lazy `getSql()` returning a tagged-template `sql`. **Use the Transaction-mode pooler URL (port 6543)** — the session-mode URL (5432) will exhaust connections under Vercel's serverless invocations. The postgres driver is configured with `prepare: false`, required by Supabase's transaction pooler.
- **bcryptjs** for the teacher password hash (admin password is time-derived, never hashed/stored)
- Client refresh via polling (2–5 s) — no WebSocket requirement per PRD

DB schema lives in [db/schema.sql](db/schema.sql) and must be applied manually via Supabase's SQL Editor (or `psql`) — there is no migration tool wired up yet. The schema assumes the `pgcrypto` extension is available, which Supabase enables by default.

## Commands

```bash
npm run dev      # dev server on :3000
npm run build    # production build
npm run start    # run built app
npm run lint     # eslint (flat config at eslint.config.mjs)
```

No test runner is configured yet. If you add one, update this section and `package.json` scripts together.

## Domain model invariants

These rules cut across the schema, UI, and auth logic — get them wrong and the whole app misbehaves.

- **Student ID (`sid`) is a 5-char string** `GCCNN`: grade(1) + class(2, zero-padded) + student number(2, zero-padded). First char must be `1-9` (no grade 0). Always store/compare as string, not integer. Example: 1학년 2반 11번 → `10211`.
- **Class rankings group by `(grade, class_no)`**, not by `class_no` alone — 1학년 2반 and 2학년 2반 are separate teams in the leaderboard.
- **`students` has no `name` column** — students are identified solely by their 5-digit ID everywhere, including personal rankings.
- **Three auth roles, each with a different credential model**:
  - *Student*: no login. Default landing screen is the leaderboard.
  - *Teacher*: username = **game name** (e.g. `제기차기`). Password = a single 6-digit code shared by all teachers, set by admin, stored hashed.
  - *Admin*: username = literal `관리자`. Password = **today's date as `YYMMDD` in `Asia/Seoul`**, computed server-side, **never stored**. It rotates at local midnight.
- **One active teacher session per game name.** A second login attempt for the same game must be rejected *and* create a `LoginAlert` surfaced on the admin dashboard. Admin can force-logout the existing session.
- **`Score` is upserted on `(event_id, game_id, sid)`**; prior value goes into `ScoreLog`. Admin edits to a teacher-entered score **must** write a `ScoreLog` row with `changed_by = admin`, `old_points`, `new_points`.
- **Deleting an Event cascades** to its Games, Scores, and ScoreLogs. The delete confirmation requires re-typing the event name (mis-click guard).

## Mobile-input conventions

All numeric fields (sid, score, 6-digit passwords) must render the phone numeric keypad:
```html
<input inputmode="numeric" pattern="[0-9]*" />
```
This is a UX requirement from the PRD, not a nice-to-have — teachers enter scores rapidly on phones during the event.

## Security notes specific to this app

- Admin password being time-derived means **do not cache it** and **do not expose the derivation** to the client. Verify server-side only.
- Teacher password hash lives in `Settings`; rotating it invalidates no sessions by itself — sessions are tracked separately in `TeacherSession`.
- Rate-limit `/api/auth/*` and `/api/scores` (5 failures/minute per IP per PRD §5.6).

## Environment

- `DATABASE_URL` — Supabase Transaction-pooler connection string (port **6543**, not 5432).
- `SESSION_SECRET` — used to sign session cookies; must be set in every environment.
- **Do not set `TZ`** — Vercel reserves it (runtime forced to UTC). Admin password derivation uses `Intl.DateTimeFormat` with `timeZone: "Asia/Seoul"` hard-coded in [src/lib/auth.ts](src/lib/auth.ts), so the process TZ is irrelevant.

## Deploy

Vercel project is configured for the `icn1` (Seoul) region via [vercel.json](vercel.json). Deployment steps are in [README.md](README.md#deploy-to-vercel). After the first deploy, run [db/schema.sql](db/schema.sql) once against Neon.

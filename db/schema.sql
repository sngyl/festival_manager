-- Festival Manager — initial schema
-- See PRD.md §3 for full data model rationale.

create extension if not exists "pgcrypto";

create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists games (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  name        text not null,
  kind        text not null default 'individual',
  created_at  timestamptz not null default now(),
  unique (event_id, name)
);

-- Idempotent migration for pre-existing DBs
alter table games add column if not exists kind text not null default 'individual';
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'games_kind_check'
  ) then
    alter table games add constraint games_kind_check
      check (kind in ('individual', 'team'));
  end if;
end $$;

-- sid is a 5-char string: GCCNN = grade(1) + class(2) + student_no(2).
-- Example: 1학년 2반 11번 → '10211'
create table if not exists students (
  sid         char(5) primary key,
  grade       int not null,
  class_no    int not null,
  student_no  int not null,
  check (sid ~ '^[1-9][0-9]{4}$'),
  check (grade between 1 and 9),
  check (class_no between 1 and 99),
  check (student_no between 1 and 99)
);

create table if not exists scores (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  game_id     uuid not null references games(id) on delete cascade,
  sid         char(5) not null references students(sid) on delete cascade,
  points      int not null,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, game_id, sid)
);

create index if not exists scores_event_sid_idx on scores (event_id, sid);
create index if not exists scores_event_game_idx on scores (event_id, game_id);

create table if not exists score_logs (
  id          uuid primary key default gen_random_uuid(),
  score_id    uuid not null references scores(id) on delete cascade,
  event_id    uuid not null,
  game_id     uuid not null,
  sid         char(5) not null,
  old_points  int,
  new_points  int not null,
  changed_by  text not null,
  changed_at  timestamptz not null default now()
);

create index if not exists score_logs_score_idx on score_logs (score_id, changed_at desc);

-- Team-game scores are stored per (event, game, grade, class_no), independent of students.
create table if not exists class_scores (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  game_id     uuid not null references games(id) on delete cascade,
  grade       int not null check (grade between 1 and 9),
  class_no    int not null check (class_no between 1 and 99),
  points      int not null,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, game_id, grade, class_no)
);

create index if not exists class_scores_event_class_idx
  on class_scores (event_id, grade, class_no);
create index if not exists class_scores_event_game_idx
  on class_scores (event_id, game_id);

create table if not exists class_score_logs (
  id              uuid primary key default gen_random_uuid(),
  class_score_id  uuid not null references class_scores(id) on delete cascade,
  event_id        uuid not null,
  game_id         uuid not null,
  grade           int not null,
  class_no        int not null,
  old_points      int,
  new_points      int not null,
  changed_by      text not null,
  changed_at      timestamptz not null default now()
);

create index if not exists class_score_logs_cs_idx
  on class_score_logs (class_score_id, changed_at desc);

create table if not exists teacher_sessions (
  game_name       text primary key,
  session_token   text not null,
  device_hint     text,
  issued_at       timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

create table if not exists login_alerts (
  id              uuid primary key default gen_random_uuid(),
  game_name       text not null,
  attempted_at    timestamptz not null default now(),
  resolved        boolean not null default false
);

create index if not exists login_alerts_unresolved_idx
  on login_alerts (attempted_at desc) where resolved = false;

create table if not exists settings (
  key    text primary key,
  value  text not null
);

-- expected keys:
--   teacher_password_hash : bcrypt hash of 6-digit code
--   active_event_id       : uuid of currently active event

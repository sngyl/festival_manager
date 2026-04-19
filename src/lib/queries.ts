import "server-only";
import { getSql } from "./db";
import type {
  ActiveEvent,
  ClassRanking,
  LeaderboardPayload,
  PersonalRanking,
  StudentDetail,
  StudentGameScore,
} from "./types";

// Big-screen scoreboard shows fixed 40 positions; phone may show more if
// the admin raised the limit, so fetch at least this many personal rows.
const SCOREBOARD_ROW_FLOOR = 40;

export async function getActiveEvent(): Promise<ActiveEvent | null> {
  const sql = getSql();
  const rows = (await sql`
    select id, name from events where active = true order by created_at desc limit 1
  `) as Array<{ id: string; name: string }>;
  return rows[0] ?? null;
}

// Ranking rules:
//   - standard rank by total descending (ties share a rank; next rank skips, e.g. 1,1,1,4)
//   - within a tied group, order by most-recent score first (last_scored desc)
export async function getClassRankings(eventId: string): Promise<ClassRanking[]> {
  const sql = getSql();
  const rows = (await sql`
    with individual as (
      select s.grade, s.class_no,
        coalesce(sum(sc.points), 0)::int as total,
        max(sc.updated_at) as last_scored
      from students s
      left join scores sc on sc.sid = s.sid and sc.event_id = ${eventId}
      group by s.grade, s.class_no
    ),
    team as (
      select grade, class_no,
        coalesce(sum(points), 0)::int as total,
        max(updated_at) as last_scored
      from class_scores
      where event_id = ${eventId}
      group by grade, class_no
    ),
    combined as (
      select grade, class_no, total, last_scored from individual
      union all
      select grade, class_no, total, last_scored from team
    ),
    class_totals as (
      select grade, class_no,
        sum(total)::int as total,
        max(last_scored) as last_scored
      from combined
      group by grade, class_no
      having sum(total) > 0
    )
    select grade, class_no as "classNo", total as "totalPoints",
      (rank() over (order by total desc))::int as rank
    from class_totals
    order by total desc, last_scored desc nulls last, grade asc, class_no asc
  `) as Array<{ grade: number; classNo: number; totalPoints: number; rank: number }>;
  return rows;
}

const DEFAULT_PERSONAL_RANK_LIMIT = 40;

export async function getPersonalRankLimit(): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    select value from settings where key = 'personal_rank_limit' limit 1
  `) as Array<{ value: string }>;
  const n = rows[0]?.value ? parseInt(rows[0].value, 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_PERSONAL_RANK_LIMIT;
}

export async function getPersonalRankings(
  eventId: string,
  rowLimit: number,
): Promise<PersonalRanking[]> {
  const sql = getSql();
  const rows = (await sql`
    with totals as (
      select sc.sid,
        sum(sc.points)::int as total,
        max(sc.updated_at) as last_scored
      from scores sc
      where sc.event_id = ${eventId}
      group by sc.sid
    )
    select sid, total as "totalPoints",
      (rank() over (order by total desc))::int as rank
    from totals
    order by total desc, last_scored desc nulls last, sid asc
    limit ${rowLimit}
  `) as Array<{ sid: string; totalPoints: number; rank: number }>;
  return rows;
}

export async function getLeaderboard(): Promise<LeaderboardPayload> {
  const event = await getActiveEvent();
  if (!event) {
    return {
      event: null,
      classRankings: [],
      personalRankings: [],
      personalLimit: DEFAULT_PERSONAL_RANK_LIMIT,
      updatedAt: new Date().toISOString(),
    };
  }
  const personalLimit = await getPersonalRankLimit();
  const rowLimit = Math.max(personalLimit, SCOREBOARD_ROW_FLOOR);
  const [classRankings, personalRankings] = await Promise.all([
    getClassRankings(event.id),
    getPersonalRankings(event.id, rowLimit),
  ]);
  return {
    event,
    classRankings,
    personalRankings,
    personalLimit,
    updatedAt: new Date().toISOString(),
  };
}

export async function getStudentDetail(sid: string): Promise<StudentDetail | null> {
  const sql = getSql();
  const studentRows = (await sql`
    select sid, grade, class_no as "classNo", student_no as "studentNo"
    from students where sid = ${sid}
  `) as Array<{ sid: string; grade: number; classNo: number; studentNo: number }>;
  const student = studentRows[0];
  if (!student) return null;

  const event = await getActiveEvent();
  if (!event) {
    return {
      ...student,
      totalPoints: 0,
      personalRank: null,
      classRank: null,
      games: [],
    };
  }

  const gameRows = (await sql`
    select g.name as "gameName", sc.points
    from scores sc
    join games g on g.id = sc.game_id
    where sc.event_id = ${event.id} and sc.sid = ${sid}
    order by g.name asc
  `) as StudentGameScore[];

  const totalPoints = gameRows.reduce((sum, g) => sum + g.points, 0);

  const personalRankRows = (await sql`
    with totals as (
      select sid, sum(points)::int as total
      from scores where event_id = ${event.id}
      group by sid
    )
    select rank from (
      select sid, rank() over (order by total desc)::int as rank from totals
    ) r where sid = ${sid}
  `) as Array<{ rank: number }>;

  const classRankRows = (await sql`
    with individual as (
      select s.grade, s.class_no, coalesce(sum(sc.points), 0)::int as total
      from students s
      left join scores sc on sc.sid = s.sid and sc.event_id = ${event.id}
      group by s.grade, s.class_no
    ),
    team as (
      select grade, class_no, coalesce(sum(points), 0)::int as total
      from class_scores
      where event_id = ${event.id}
      group by grade, class_no
    ),
    combined as (
      select grade, class_no, total from individual
      union all
      select grade, class_no, total from team
    ),
    class_totals as (
      select grade, class_no, sum(total)::int as total
      from combined
      group by grade, class_no
    )
    select rank from (
      select grade, class_no, rank() over (order by total desc)::int as rank from class_totals
    ) r where grade = ${student.grade} and class_no = ${student.classNo}
  `) as Array<{ rank: number }>;

  return {
    ...student,
    totalPoints,
    personalRank: personalRankRows[0]?.rank ?? null,
    classRank: classRankRows[0]?.rank ?? null,
    games: gameRows,
  };
}

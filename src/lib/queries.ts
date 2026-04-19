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

export async function getActiveEvent(): Promise<ActiveEvent | null> {
  const sql = getSql();
  const rows = (await sql`
    select id, name from events where active = true order by created_at desc limit 1
  `) as Array<{ id: string; name: string }>;
  return rows[0] ?? null;
}

export async function getClassRankings(eventId: string): Promise<ClassRanking[]> {
  const sql = getSql();
  const rows = (await sql`
    select s.grade, s.class_no as "classNo", coalesce(sum(sc.points), 0)::int as "totalPoints"
    from students s
    left join scores sc on sc.sid = s.sid and sc.event_id = ${eventId}
    group by s.grade, s.class_no
    having coalesce(sum(sc.points), 0) > 0
    order by "totalPoints" desc, s.grade asc, s.class_no asc
  `) as Array<{ grade: number; classNo: number; totalPoints: number }>;
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

const DEFAULT_PERSONAL_RANK_LIMIT = 100;

export async function getPersonalRankLimit(): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    select value from settings where key = 'personal_rank_limit' limit 1
  `) as Array<{ value: string }>;
  const n = rows[0]?.value ? parseInt(rows[0].value, 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_PERSONAL_RANK_LIMIT;
}

export async function getPersonalRankings(eventId: string): Promise<PersonalRanking[]> {
  const sql = getSql();
  const limit = await getPersonalRankLimit();
  const rows = (await sql`
    select sid, sum(points)::int as "totalPoints"
    from scores
    where event_id = ${eventId}
    group by sid
    order by "totalPoints" desc, sid asc
    limit ${limit}
  `) as Array<{ sid: string; totalPoints: number }>;
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

export async function getLeaderboard(): Promise<LeaderboardPayload> {
  const event = await getActiveEvent();
  if (!event) {
    return {
      event: null,
      classRankings: [],
      personalRankings: [],
      updatedAt: new Date().toISOString(),
    };
  }
  const [classRankings, personalRankings] = await Promise.all([
    getClassRankings(event.id),
    getPersonalRankings(event.id),
  ]);
  return {
    event,
    classRankings,
    personalRankings,
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
      select sid, dense_rank() over (order by total desc)::int as rank from totals
    ) r where sid = ${sid}
  `) as Array<{ rank: number }>;

  const classRankRows = (await sql`
    with class_totals as (
      select s.grade, s.class_no, coalesce(sum(sc.points), 0)::int as total
      from students s
      left join scores sc on sc.sid = s.sid and sc.event_id = ${event.id}
      group by s.grade, s.class_no
    )
    select rank from (
      select grade, class_no, dense_rank() over (order by total desc)::int as rank from class_totals
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

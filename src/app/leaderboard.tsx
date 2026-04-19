"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type {
  ClassRanking,
  LeaderboardPayload,
  PersonalRanking,
  StudentDetail,
} from "@/lib/types";

type Tab = "class" | "personal" | "me";
type Role = "teacher" | "admin" | null;

const POLL_MS = 5000;
const ROTATE_MS = 5000;
const BIG_SCREEN_SLOTS = 40;

export default function Scoreboard({ role }: { role: Role }) {
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
      const json = (await res.json()) as LeaderboardPayload;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    }
  }, []);

  useEffect(() => {
    fetchBoard();
    const id = setInterval(fetchBoard, POLL_MS);
    return () => clearInterval(id);
  }, [fetchBoard]);

  return (
    <>
      <div className="md:hidden">
        <PhoneView data={data} error={error} role={role} />
      </div>
      <div className="hidden md:block">
        <BigScreenView data={data} error={error} role={role} />
      </div>
    </>
  );
}

function roleButton(role: Role) {
  if (role === "teacher") return { label: "선생님", href: "/teacher" };
  if (role === "admin") return { label: "관리자", href: "/admin" };
  return { label: "로그인", href: "/login" };
}

// ---------- Phone ----------

function PhoneView({
  data,
  error,
  role,
}: {
  data: LeaderboardPayload | null;
  error: string | null;
  role: Role;
}) {
  const [tab, setTab] = useState<Tab>("class");
  const updatedLabel = useMemo(() => {
    if (!data) return "";
    const d = new Date(data.updatedAt);
    return d.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, [data]);
  const { label: btnLabel, href: btnHref } = roleButton(role);

  const personalSliced = useMemo(() => {
    if (!data) return [];
    return data.personalRankings.slice(0, data.personalLimit);
  }, [data]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-white text-zinc-900 dark:bg-black dark:text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              전광판
            </div>
            <h1 className="truncate text-lg font-semibold">
              {data?.event?.name ?? "진행 중인 행사 없음"}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {updatedLabel && (
              <span className="text-xs text-zinc-500">갱신 {updatedLabel}</span>
            )}
            <a
              href={btnHref}
              className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {btnLabel}
            </a>
          </div>
        </div>
      </header>

      <nav className="flex border-b border-zinc-200 dark:border-zinc-800">
        {(
          [
            { id: "class", label: "반 순위" },
            { id: "personal", label: "개인 순위" },
            { id: "me", label: "내 점수" },
          ] as Array<{ id: Tab; label: string }>
        ).map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                active
                  ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "text-zinc-500"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <main className="flex-1 px-4 pb-12 pt-3">
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
        {!data && !error && (
          <p className="py-10 text-center text-zinc-500">불러오는 중…</p>
        )}
        {data && tab === "class" && <PhoneClassTable rows={data.classRankings} />}
        {data && tab === "personal" && <PhonePersonalTable rows={personalSliced} />}
        {tab === "me" && <MyScore />}
      </main>
    </div>
  );
}

function PhoneClassTable({ rows }: { rows: ClassRanking[] }) {
  if (rows.length === 0) return <EmptyState />;
  return (
    <ol className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-900">
      {rows.map((row, i) => (
        <li
          key={`${row.grade}-${row.classNo}-${i}`}
          className="flex items-center justify-between py-3"
        >
          <div className="flex items-center gap-3">
            <RankBadge rank={row.rank} />
            <span className="text-base font-medium">
              {row.grade}학년 {String(row.classNo).padStart(2, "0")}반
            </span>
          </div>
          <span className="tabular-nums text-base font-semibold">
            {row.totalPoints}
          </span>
        </li>
      ))}
    </ol>
  );
}

function PhonePersonalTable({ rows }: { rows: PersonalRanking[] }) {
  if (rows.length === 0) return <EmptyState />;
  return (
    <ol className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-900">
      {rows.map((row, i) => (
        <li
          key={`${row.sid}-${i}`}
          className="flex items-center justify-between py-3"
        >
          <div className="flex items-center gap-3">
            <RankBadge rank={row.rank} />
            <span className="font-mono text-base tabular-nums">{row.sid}</span>
          </div>
          <span className="tabular-nums text-base font-semibold">
            {row.totalPoints}
          </span>
        </li>
      ))}
    </ol>
  );
}

function MyScore() {
  const [sid, setSid] = useState("");
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(async (value: string) => {
    if (!/^[1-9]\d{4}$/.test(value)) {
      setError("5자리 숫자를 입력해 주세요. (학년+반+번호)");
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/student/${value}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setDetail(null);
        setError(json.error ?? "조회 실패");
        return;
      }
      setDetail(json as StudentDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!detail) return;
    const id = setInterval(() => lookup(detail.sid), POLL_MS);
    return () => clearInterval(id);
  }, [detail, lookup]);

  return (
    <div className="mt-4 space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup(sid);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={5}
          autoComplete="off"
          placeholder="개인식별번호 5자리 (학년+반+번호)"
          value={sid}
          onChange={(e) =>
            setSid(e.target.value.replace(/\D/g, "").slice(0, 5))
          }
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-3 text-center font-mono text-lg tabular-nums tracking-widest outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-zinc-900 px-5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          조회
        </button>
      </form>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {detail && (
        <div className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="font-mono text-xs text-zinc-500">
                {detail.sid}
              </div>
              <div className="text-lg font-semibold">
                {detail.grade}학년 {detail.classNo}반 {detail.studentNo}번
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500">총점</div>
              <div className="tabular-nums text-2xl font-bold">
                {detail.totalPoints}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
              <div className="text-zinc-500">개인 순위</div>
              <div className="tabular-nums text-lg font-semibold">
                {detail.personalRank ? `${detail.personalRank}위` : "-"}
              </div>
            </div>
            <div className="rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
              <div className="text-zinc-500">반 순위</div>
              <div className="tabular-nums text-lg font-semibold">
                {detail.classRank ? `${detail.classRank}위` : "-"}
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-zinc-500">
              게임별 점수
            </h2>
            {detail.games.length === 0 ? (
              <p className="py-2 text-sm text-zinc-500">
                아직 획득한 점수가 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {detail.games.map((g) => (
                  <li
                    key={g.gameName}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="text-sm">{g.gameName}</span>
                    <span className="tabular-nums text-sm font-semibold">
                      {g.points}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const tone =
    rank === 1
      ? "bg-amber-400 text-amber-950"
      : rank === 2
        ? "bg-zinc-300 text-zinc-800"
        : rank === 3
          ? "bg-orange-300 text-orange-950"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums ${tone}`}
    >
      {rank}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="py-16 text-center text-sm text-zinc-500">
      아직 입력된 점수가 없습니다.
    </div>
  );
}

// ---------- Big screen (laptop / display) ----------

function BigScreenView({
  data,
  error,
  role,
}: {
  data: LeaderboardPayload | null;
  error: string | null;
  role: Role;
}) {
  const [view, setView] = useState<"class" | "personal">("class");
  const { label: btnLabel, href: btnHref } = roleButton(role);

  useEffect(() => {
    const id = setInterval(() => {
      setView((v) => (v === "class" ? "personal" : "class"));
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-dvh w-full flex-col bg-black text-zinc-100">
      <section className="relative flex h-[15dvh] items-center justify-center border-b border-zinc-800 px-8">
        <h1 className="truncate text-center text-5xl font-extrabold tracking-tight lg:text-6xl">
          {data?.event?.name ?? "진행 중인 행사 없음"}
        </h1>
        <a
          href={btnHref}
          className="absolute right-6 top-1/2 -translate-y-1/2 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
        >
          {btnLabel}
        </a>
      </section>

      <section className="flex min-h-0 flex-1 flex-col px-6 py-3">
        <div className="mb-2 flex items-center justify-center gap-3">
          <span
            className={`rounded-full px-4 py-1 text-lg font-semibold ${
              view === "class"
                ? "bg-amber-400 text-black"
                : "bg-zinc-800 text-zinc-500"
            }`}
          >
            반 순위
          </span>
          <span
            className={`rounded-full px-4 py-1 text-lg font-semibold ${
              view === "personal"
                ? "bg-amber-400 text-black"
                : "bg-zinc-800 text-zinc-500"
            }`}
          >
            개인 순위
          </span>
        </div>
        {error && (
          <p className="mx-auto mb-1 rounded-md bg-red-950/40 px-3 py-1 text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="min-h-0 flex-1">
          {view === "class" ? (
            <BigRankTable rows={data?.classRankings ?? []} kind="class" />
          ) : (
            <BigRankTable
              rows={data?.personalRankings ?? []}
              kind="personal"
            />
          )}
        </div>
      </section>

      <section className="h-[10dvh] border-t border-zinc-800 bg-zinc-950">
        <BigSidInput />
      </section>
    </div>
  );
}

type BigRow =
  | (ClassRanking & { kind: "class" })
  | (PersonalRanking & { kind: "personal" });

function BigRankTable({
  rows,
  kind,
}: {
  rows: ClassRanking[] | PersonalRanking[];
  kind: "class" | "personal";
}) {
  // Always render fixed 40 slots arranged as 4 groups × 10 rows.
  // Layout per row: [rank1][data1][rank2][data2][rank3][data3][rank4][data4]
  return (
    <table className="h-full w-full table-fixed border-separate border-spacing-x-2 border-spacing-y-1">
      <tbody>
        {Array.from({ length: 10 }, (_, r) => (
          <tr key={r}>
            {[0, 1, 2, 3].map((g) => {
              const slot = g * 10 + r;
              const item = (rows as Array<ClassRanking | PersonalRanking>)[
                slot
              ];
              const row: BigRow | undefined = item
                ? kind === "class"
                  ? { ...(item as ClassRanking), kind: "class" }
                  : { ...(item as PersonalRanking), kind: "personal" }
                : undefined;
              return (
                <Fragment key={g}>
                  <td className="w-12 text-right tabular-nums text-2xl font-bold text-amber-400">
                    {row ? row.rank : ""}
                  </td>
                  <td className="rounded-md bg-zinc-900 px-3 py-1.5 align-middle">
                    {row ? (
                      <BigCellContent row={row} />
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                  </td>
                </Fragment>
              );
            })}
          </tr>
        ))}
        {slotAnyEmpty(rows) && rows.length === 0 ? (
          <tr>
            <td colSpan={8} className="pt-4 text-center text-zinc-500">
              아직 입력된 점수가 없습니다.
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function slotAnyEmpty(rows: ClassRanking[] | PersonalRanking[]): boolean {
  return rows.length < BIG_SCREEN_SLOTS;
}

function BigCellContent({ row }: { row: BigRow }) {
  if (row.kind === "class") {
    return (
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xl">
          {row.grade}학년 {String(row.classNo).padStart(2, "0")}반
        </span>
        <span className="shrink-0 tabular-nums text-xl font-bold">
          {row.totalPoints}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="truncate font-mono text-xl tabular-nums">
        {row.sid}
      </span>
      <span className="shrink-0 tabular-nums text-xl font-bold">
        {row.totalPoints}
      </span>
    </div>
  );
}

function BigSidInput() {
  const [sid, setSid] = useState("");
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(value: string) {
    if (!/^[1-9]\d{4}$/.test(value)) {
      setError("해당 번호를 찾을 수 없습니다.");
      setDetail(null);
      return;
    }
    try {
      const res = await fetch(`/api/student/${value}`, { cache: "no-store" });
      if (!res.ok) {
        setDetail(null);
        setError("해당 번호를 찾을 수 없습니다.");
        return;
      }
      const json = await res.json();
      setDetail(json as StudentDetail);
      setError(null);
    } catch {
      setDetail(null);
      setError("해당 번호를 찾을 수 없습니다.");
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        lookup(sid);
      }}
      className="flex h-full items-center gap-4 px-6"
    >
      <label className="shrink-0 text-lg font-semibold text-zinc-300">
        개인순위확인
      </label>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={5}
        autoComplete="off"
        placeholder="G C C N N"
        value={sid}
        onChange={(e) => setSid(e.target.value.replace(/\D/g, "").slice(0, 5))}
        className="w-44 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-center font-mono text-2xl tabular-nums tracking-widest text-zinc-100 outline-none focus:border-zinc-100"
      />
      <button
        type="submit"
        className="shrink-0 rounded-md bg-zinc-100 px-5 py-2 text-base font-semibold text-zinc-900"
      >
        조회
      </button>
      <div className="min-w-0 flex-1 truncate text-xl">
        {error && <span className="text-red-400">{error}</span>}
        {!error && detail && (
          <span>
            <span className="font-mono text-zinc-400">{detail.sid}</span>
            <span className="mx-2 text-zinc-600">·</span>
            개인{" "}
            <b className="tabular-nums text-amber-400">
              {detail.personalRank ?? "-"}
            </b>
            위
            <span className="mx-2 text-zinc-600">·</span>반{" "}
            <b className="tabular-nums text-amber-400">
              {detail.classRank ?? "-"}
            </b>
            위
            <span className="mx-2 text-zinc-600">·</span>총점{" "}
            <b className="tabular-nums">{detail.totalPoints}</b>점
          </span>
        )}
      </div>
    </form>
  );
}

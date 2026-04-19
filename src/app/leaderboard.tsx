"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LeaderboardPayload, StudentDetail } from "@/lib/types";

type Tab = "class" | "personal" | "me";

const POLL_MS = 5000;

export default function Leaderboard() {
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("class");

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
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-white text-zinc-900 dark:bg-black dark:text-zinc-100">
      <Header data={data} />
      <Tabs tab={tab} onChange={setTab} />
      <main className="flex-1 px-4 pb-12 pt-3">
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
        {!data && !error && <p className="py-10 text-center text-zinc-500">불러오는 중…</p>}
        {data && tab === "class" && <ClassTable data={data} />}
        {data && tab === "personal" && <PersonalTable data={data} />}
        {tab === "me" && <MyScore />}
      </main>
    </div>
  );
}

function Header({ data }: { data: LeaderboardPayload | null }) {
  const updatedLabel = useMemo(() => {
    if (!data) return "";
    const d = new Date(data.updatedAt);
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }, [data]);

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            학생 모드
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
            href="/login"
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            로그인
          </a>
        </div>
      </div>
    </header>
  );
}

function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "class", label: "반별 순위" },
    { id: "personal", label: "개인 순위" },
    { id: "me", label: "내 점수" },
  ];
  return (
    <nav className="flex border-b border-zinc-200 dark:border-zinc-800">
      {tabs.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
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
  );
}

function ClassTable({ data }: { data: LeaderboardPayload }) {
  if (data.classRankings.length === 0) {
    return <EmptyState />;
  }
  return (
    <ol className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-900">
      {data.classRankings.map((row) => (
        <li key={`${row.grade}-${row.classNo}`} className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <RankBadge rank={row.rank} />
            <span className="text-base font-medium">
              {row.grade}학년 {row.classNo}반
            </span>
          </div>
          <span className="tabular-nums text-base font-semibold">{row.totalPoints}</span>
        </li>
      ))}
    </ol>
  );
}

function PersonalTable({ data }: { data: LeaderboardPayload }) {
  if (data.personalRankings.length === 0) {
    return <EmptyState />;
  }
  return (
    <ol className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-900">
      {data.personalRankings.map((row) => (
        <li key={row.sid} className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <RankBadge rank={row.rank} />
            <span className="font-mono text-base tabular-nums">{row.sid}</span>
          </div>
          <span className="tabular-nums text-base font-semibold">{row.totalPoints}</span>
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
          onChange={(e) => setSid(e.target.value.replace(/\D/g, "").slice(0, 5))}
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
              <div className="font-mono text-xs text-zinc-500">{detail.sid}</div>
              <div className="text-lg font-semibold">
                {detail.grade}학년 {detail.classNo}반 {detail.studentNo}번
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500">총점</div>
              <div className="tabular-nums text-2xl font-bold">{detail.totalPoints}</div>
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
            <h2 className="mb-2 text-sm font-semibold text-zinc-500">게임별 점수</h2>
            {detail.games.length === 0 ? (
              <p className="py-2 text-sm text-zinc-500">아직 획득한 점수가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {detail.games.map((g) => (
                  <li key={g.gameName} className="flex items-center justify-between py-2">
                    <span className="text-sm">{g.gameName}</span>
                    <span className="tabular-nums text-sm font-semibold">{g.points}</span>
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

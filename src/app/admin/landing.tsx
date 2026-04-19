"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type EventRow = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  game_count: number;
  score_count: number;
};

type GameKind = "individual" | "team";

type GameRow = {
  id: string;
  name: string;
  kind: GameKind;
  created_at: string;
  score_count: number;
  active_session: boolean;
};

type Alert = { id: string; game_name: string; attempted_at: string };

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export default function AdminLanding() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [studentsReloadKey, setStudentsReloadKey] = useState(0);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const { events } = await jsonFetch<{ events: EventRow[] }>("/api/events");
      setEvents(events);
      setSelectedId((cur) => {
        if (cur && events.some((e) => e.id === cur)) return cur;
        return events.find((e) => e.active)?.id ?? events[0]?.id ?? null;
      });
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "행사 조회 실패");
    }
  }, [flash]);

  const loadGames = useCallback(
    async (eventId: string) => {
      try {
        const { games } = await jsonFetch<{ games: GameRow[] }>(
          `/api/games?event_id=${eventId}`,
        );
        setGames(games);
      } catch (e) {
        flash("err", e instanceof Error ? e.message : "게임 조회 실패");
      }
    },
    [flash],
  );

  const loadAlerts = useCallback(async () => {
    try {
      const { alerts } = await jsonFetch<{ alerts: Alert[] }>("/api/alerts");
      setAlerts(alerts);
    } catch {
      // Silent: polling should not spam toasts.
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (selectedId) loadGames(selectedId);
  }, [selectedId, loadGames]);

  useEffect(() => {
    loadAlerts();
    const t = setInterval(loadAlerts, 3000);
    return () => clearInterval(t);
  }, [loadAlerts]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col bg-white px-5 py-6 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">관리자</h1>
        <div className="flex items-center gap-2">
          <a
            href="/"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
          >
            리더보드
          </a>
          <button
            onClick={logout}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
          >
            로그아웃
          </button>
        </div>
      </header>

      <AlertsBanner
        alerts={alerts}
        onResolve={async (id) => {
          await jsonFetch(`/api/alerts/${id}/resolve`, { method: "POST" });
          loadAlerts();
        }}
        onForceLogout={async (gameName) => {
          await jsonFetch(`/api/admin/force-logout`, {
            method: "POST",
            body: JSON.stringify({ gameName }),
          });
          flash("ok", `${gameName} 세션 종료됨`);
          if (selectedId) loadGames(selectedId);
        }}
      />

      <EventsSection
        events={events}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreated={() => {
          loadEvents();
          setStudentsReloadKey((k) => k + 1);
        }}
        onMutated={() => loadEvents()}
        flash={flash}
      />

      {selectedId && (
        <>
          <GamesSection
            eventId={selectedId}
            games={games}
            kind="individual"
            title="개인 게임"
            placeholder="새 게임 이름 (예: 제기차기)"
            reload={() => loadGames(selectedId)}
            flash={flash}
          />
          <GamesSection
            eventId={selectedId}
            games={games}
            kind="team"
            title="단체 게임"
            placeholder="새 단체 게임 이름 (예: 줄다리기)"
            reload={() => loadGames(selectedId)}
            flash={flash}
          />
        </>
      )}

      {selectedId && (
        <ScoresSection eventId={selectedId} games={games} flash={flash} />
      )}

      <SettingsSection flash={flash} />

      <StudentsSection flash={flash} reloadKey={studentsReloadKey} />

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md px-4 py-2 text-sm shadow-lg ${
            toast.kind === "ok"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ---------- Alerts ----------
function AlertsBanner({
  alerts,
  onResolve,
  onForceLogout,
}: {
  alerts: Alert[];
  onResolve: (id: string) => Promise<void>;
  onForceLogout: (gameName: string) => Promise<void>;
}) {
  if (alerts.length === 0) return null;
  return (
    <section className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
      <div className="mb-2 font-semibold text-red-800 dark:text-red-200">
        ⚠️ 동시 로그인 시도 감지
      </div>
      <ul className="space-y-1">
        {alerts.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2">
            <span className="text-red-900 dark:text-red-100">
              {a.game_name}{" "}
              <span className="text-xs text-red-700 dark:text-red-300">
                ({new Date(a.attempted_at).toLocaleTimeString("ko-KR")})
              </span>
            </span>
            <span className="flex gap-2">
              <button
                onClick={() => onForceLogout(a.game_name)}
                className="rounded border border-red-400 px-2 py-0.5 text-xs text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-900/40"
              >
                강제 로그아웃
              </button>
              <button
                onClick={() => onResolve(a.id)}
                className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                확인
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Events ----------
function EventsSection({
  events,
  selectedId,
  onSelect,
  onCreated,
  onMutated,
  flash,
}: {
  events: EventRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: () => void;
  onMutated: () => void;
  flash: (k: "ok" | "err", t: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [activateNew, setActivateNew] = useState(true);
  const [deleting, setDeleting] = useState<EventRow | null>(null);
  const [confirmName, setConfirmName] = useState("");

  async function create() {
    const name = newName.trim();
    if (!name) return;
    if (
      !confirm(
        "새 행사를 생성하면 기존 학생, 점수, 점수 기록이 모두 삭제됩니다. 계속하시겠습니까?",
      )
    ) {
      return;
    }
    try {
      await jsonFetch("/api/events", {
        method: "POST",
        body: JSON.stringify({ name, activate: activateNew }),
      });
      setNewName("");
      flash("ok", "행사 생성 완료");
      onCreated();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "실패");
    }
  }

  async function toggleActive(ev: EventRow) {
    try {
      await jsonFetch(`/api/events/${ev.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !ev.active }),
      });
      onMutated();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "실패");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await jsonFetch(`/api/events/${deleting.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmName }),
      });
      flash("ok", `"${deleting.name}" 삭제됨`);
      setDeleting(null);
      setConfirmName("");
      onMutated();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "실패");
    }
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-zinc-500">행사</h2>
      <div className="mb-3 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="새 행사 이름"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <label className="flex shrink-0 items-center gap-1 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={activateNew}
            onChange={(e) => setActivateNew(e.target.checked)}
          />
          바로 활성화
        </label>
        <button
          onClick={create}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          추가
        </button>
      </div>

      <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {events.length === 0 && (
          <li className="p-4 text-center text-sm text-zinc-500">등록된 행사가 없습니다.</li>
        )}
        {events.map((ev) => (
          <li
            key={ev.id}
            className={`flex items-center justify-between gap-2 px-3 py-2 ${
              selectedId === ev.id ? "bg-zinc-50 dark:bg-zinc-900" : ""
            }`}
          >
            <button
              onClick={() => onSelect(ev.id)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{ev.name}</span>
                {ev.active && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    활성
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-500">
                게임 {ev.game_count} · 점수 {ev.score_count}
              </div>
            </button>
            <button
              onClick={() => toggleActive(ev)}
              className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            >
              {ev.active ? "비활성" : "활성"}
            </button>
            <a
              href={`/api/events/${ev.id}/export`}
              download
              className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            >
              순위저장
            </a>
            <button
              onClick={() => {
                setDeleting(ev);
                setConfirmName("");
              }}
              className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:text-red-300"
            >
              삭제
            </button>
          </li>
        ))}
      </ul>

      {deleting && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900">
            <h3 className="text-base font-semibold">행사 삭제</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              <b>{deleting.name}</b>을(를) 삭제하면 모든 게임, 점수, 로그가 영구 삭제됩니다.
              계속하려면 아래에 행사 이름을 정확히 입력하세요.
            </p>
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={deleting.name}
              className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeleting(null);
                  setConfirmName("");
                }}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                disabled={confirmName !== deleting.name}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                영구 삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- Games ----------
function GamesSection({
  eventId,
  games,
  kind,
  title,
  placeholder,
  reload,
  flash,
}: {
  eventId: string;
  games: GameRow[];
  kind: GameKind;
  title: string;
  placeholder: string;
  reload: () => void;
  flash: (k: "ok" | "err", t: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const visible = games.filter((g) => g.kind === kind);

  async function add() {
    const name = newName.trim();
    if (!name) return;
    try {
      await jsonFetch("/api/games", {
        method: "POST",
        body: JSON.stringify({ event_id: eventId, name, kind }),
      });
      setNewName("");
      flash("ok", "게임 추가됨");
      reload();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "실패");
    }
  }

  async function save(id: string) {
    const name = editName.trim();
    if (!name) return;
    try {
      await jsonFetch(`/api/games/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setEditing(null);
      flash("ok", "게임 수정됨");
      reload();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "실패");
    }
  }

  async function del(id: string, name: string) {
    if (!confirm(`"${name}" 게임을 삭제할까요? (관련 점수/로그도 모두 삭제)`)) return;
    try {
      await jsonFetch(`/api/games/${id}`, { method: "DELETE" });
      flash("ok", "게임 삭제됨");
      reload();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "실패");
    }
  }

  async function forceLogout(gameName: string) {
    try {
      await jsonFetch("/api/admin/force-logout", {
        method: "POST",
        body: JSON.stringify({ gameName }),
      });
      flash("ok", `${gameName} 세션 종료됨`);
      reload();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "실패");
    }
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-zinc-500">{title}</h2>
      <div className="mb-3 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <button
          onClick={add}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          추가
        </button>
      </div>

      <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {visible.length === 0 && (
          <li className="p-4 text-center text-sm text-zinc-500">게임이 없습니다.</li>
        )}
        {visible.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              {editing === g.id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save(g.id);
                    if (e.key === "Escape") setEditing(null);
                  }}
                  autoFocus
                  className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{g.name}</span>
                    {g.active_session && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        선생님 접속중
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">점수 {g.score_count}</div>
                </div>
              )}
            </div>
            {editing === g.id ? (
              <>
                <button
                  onClick={() => save(g.id)}
                  className="rounded bg-zinc-900 px-2 py-1 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  저장
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                >
                  취소
                </button>
              </>
            ) : (
              <>
                {g.active_session && (
                  <button
                    onClick={() => forceLogout(g.name)}
                    className="rounded border border-amber-400 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:text-amber-300"
                  >
                    세션 종료
                  </button>
                )}
                <button
                  onClick={() => {
                    setEditing(g.id);
                    setEditName(g.name);
                  }}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                >
                  이름
                </button>
                <button
                  onClick={() => del(g.id, g.name)}
                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:text-red-300"
                >
                  삭제
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Scores ----------
type ScoreRow = {
  id: string;
  sid: string;
  game_id: string;
  game_name: string;
  points: number;
  created_by: string;
  updated_at: string;
  grade: number;
  class_no: number;
  student_no: number;
};

type ScoreLog = {
  id: string;
  old_points: number | null;
  new_points: number;
  changed_by: string;
  changed_at: string;
};

type ScoreView = "game" | "student" | "class";

function ScoresSection({
  eventId,
  games,
  flash,
}: {
  eventId: string;
  games: GameRow[];
  flash: (k: "ok" | "err", t: string) => void;
}) {
  const [view, setView] = useState<ScoreView>("game");
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [gameFilter, setGameFilter] = useState<string>("");
  const [sidFilter, setSidFilter] = useState<string>("");
  const [gradeFilter, setGradeFilter] = useState<string>("");
  const [classFilter, setClassFilter] = useState<string>("");

  const [historyFor, setHistoryFor] = useState<ScoreRow | null>(null);
  const [adding, setAdding] = useState(false);

  const individualGames = games.filter((g) => g.kind === "individual");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { scores } = await jsonFetch<{ scores: ScoreRow[] }>(
        `/api/scores?event_id=${eventId}`,
      );
      setScores(scores);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "점수 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [eventId, flash]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (view === "game" && !gameFilter && individualGames.length > 0) {
      setGameFilter(individualGames[0].name);
    }
  }, [view, gameFilter, individualGames]);

  async function savePoints(row: ScoreRow, nextPoints: number) {
    if (row.points === nextPoints) return;
    try {
      await jsonFetch("/api/scores", {
        method: "POST",
        body: JSON.stringify({
          sid: row.sid,
          points: nextPoints,
          gameName: row.game_name,
        }),
      });
      flash("ok", `${row.sid} · ${row.game_name} = ${nextPoints}`);
      load();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "저장 실패");
    }
  }

  const filteredByGame = gameFilter
    ? scores.filter((s) => s.game_name === gameFilter)
    : [];
  const filteredBySid = sidFilter.length === 5
    ? scores.filter((s) => s.sid === sidFilter)
    : [];
  const filteredByClass = (() => {
    const g = parseInt(gradeFilter, 10);
    const c = parseInt(classFilter, 10);
    if (!Number.isInteger(g) || !Number.isInteger(c)) return [];
    return scores.filter((s) => s.grade === g && s.class_no === c);
  })();

  const classRowsByStudent: Array<{ sid: string; student_no: number; cells: ScoreRow[] }> = (() => {
    const map = new Map<string, { sid: string; student_no: number; cells: ScoreRow[] }>();
    for (const s of filteredByClass) {
      const entry = map.get(s.sid) ?? { sid: s.sid, student_no: s.student_no, cells: [] };
      entry.cells.push(s);
      map.set(s.sid, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.student_no - b.student_no);
  })();

  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-zinc-500">
        <span>점수 편집</span>
        <span className="text-xs font-normal">{scores.length}건</span>
      </h2>

      <div className="mb-3 flex gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
        {(["game", "student", "class"] as ScoreView[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded px-2 py-1.5 font-medium transition ${
              view === v
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                : "text-zinc-500"
            }`}
          >
            {v === "game" ? "게임별" : v === "student" ? "학생별" : "반별"}
          </button>
        ))}
      </div>

      {view === "game" && (
        <div>
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
            className="mb-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {individualGames.length === 0 && <option value="">게임 없음</option>}
            {individualGames.map((g) => (
              <option key={g.id} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>
          <ScoreTable
            rows={filteredByGame}
            columns={["sid", "points"]}
            loading={loading}
            onSave={savePoints}
            onHistory={setHistoryFor}
          />
        </div>
      )}

      {view === "student" && (
        <div>
          <input
            value={sidFilter}
            onChange={(e) => setSidFilter(e.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="개인식별번호 (5자리)"
            className="mb-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-center font-mono tracking-[0.3em] dark:border-zinc-700 dark:bg-zinc-900"
          />
          <ScoreTable
            rows={filteredBySid}
            columns={["game", "points"]}
            loading={loading}
            emptyText={
              sidFilter.length === 5
                ? "해당 학생의 점수가 없습니다."
                : "5자리 번호를 입력하세요."
            }
            onSave={savePoints}
            onHistory={setHistoryFor}
          />
        </div>
      )}

      {view === "class" && (
        <div>
          <div className="mb-2 flex gap-2">
            <input
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value.replace(/\D/g, "").slice(0, 1))}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="학년"
              className="w-20 rounded-md border border-zinc-300 bg-white px-3 py-2 text-center dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value.replace(/\D/g, "").slice(0, 2))}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="반"
              className="w-20 rounded-md border border-zinc-300 bg-white px-3 py-2 text-center dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          {gradeFilter && classFilter ? (
            classRowsByStudent.length === 0 ? (
              <div className="rounded-md border border-zinc-200 p-4 text-center text-sm text-zinc-500 dark:border-zinc-800">
                해당 반의 점수가 없습니다.
              </div>
            ) : (
              <div className="space-y-2">
                {classRowsByStudent.map((stu) => (
                  <details
                    key={stu.sid}
                    open
                    className="rounded-md border border-zinc-200 dark:border-zinc-800"
                  >
                    <summary className="cursor-pointer px-3 py-2 text-sm font-mono">
                      {stu.sid}{" "}
                      <span className="text-xs text-zinc-500">
                        · {stu.cells.length}개 게임 · 합 {stu.cells.reduce((a, c) => a + c.points, 0)}점
                      </span>
                    </summary>
                    <ScoreTable
                      rows={stu.cells}
                      columns={["game", "points"]}
                      loading={false}
                      onSave={savePoints}
                      onHistory={setHistoryFor}
                      embedded
                    />
                  </details>
                ))}
              </div>
            )
          ) : (
            <div className="rounded-md border border-zinc-200 p-4 text-center text-sm text-zinc-500 dark:border-zinc-800">
              학년과 반을 입력하세요.
            </div>
          )}
        </div>
      )}

      <div className="mt-3">
        <button
          onClick={() => setAdding(true)}
          className="w-full rounded-md border border-dashed border-zinc-300 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          + 점수 수동 추가
        </button>
      </div>

      {adding && (
        <ScoreAddModal
          games={individualGames}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
          flash={flash}
        />
      )}

      {historyFor && (
        <ScoreHistoryModal
          row={historyFor}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </section>
  );
}

function ScoreTable({
  rows,
  columns,
  loading,
  emptyText,
  onSave,
  onHistory,
  embedded,
}: {
  rows: ScoreRow[];
  columns: ("sid" | "game" | "points")[];
  loading: boolean;
  emptyText?: string;
  onSave: (row: ScoreRow, next: number) => Promise<void> | void;
  onHistory: (row: ScoreRow) => void;
  embedded?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-md border border-zinc-200 p-4 text-center text-sm text-zinc-500 dark:border-zinc-800">
        불러오는 중...
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div
        className={`${embedded ? "" : "rounded-md border border-zinc-200 dark:border-zinc-800"} p-4 text-center text-sm text-zinc-500`}
      >
        {emptyText ?? "점수가 없습니다."}
      </div>
    );
  }
  return (
    <ul
      className={`${embedded ? "border-t border-zinc-200 dark:border-zinc-800" : "rounded-md border border-zinc-200 dark:border-zinc-800"} divide-y divide-zinc-200 dark:divide-zinc-800`}
    >
      {rows.map((r) => (
        <ScoreCell
          key={r.id}
          row={r}
          columns={columns}
          onSave={onSave}
          onHistory={onHistory}
        />
      ))}
    </ul>
  );
}

function ScoreCell({
  row,
  columns,
  onSave,
  onHistory,
}: {
  row: ScoreRow;
  columns: ("sid" | "game" | "points")[];
  onSave: (row: ScoreRow, next: number) => Promise<void> | void;
  onHistory: (row: ScoreRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(row.points));

  useEffect(() => {
    if (!editing) setDraft(String(row.points));
  }, [editing, row.points]);

  async function commit() {
    const n = parseInt(draft, 10);
    if (!Number.isInteger(n)) {
      setDraft(String(row.points));
      setEditing(false);
      return;
    }
    setEditing(false);
    await onSave(row, n);
  }

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate">
        {columns.includes("sid") && <span className="font-mono">{row.sid}</span>}
        {columns.includes("sid") && columns.includes("game") && " · "}
        {columns.includes("game") && <span>{row.game_name}</span>}
      </span>
      {editing ? (
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          pattern="-?[0-9]*"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d-]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(String(row.points));
              setEditing(false);
            }
          }}
          className="w-20 rounded border border-zinc-900 px-2 py-1 text-right font-mono text-sm dark:border-zinc-100 dark:bg-zinc-950"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="rounded border border-transparent px-2 py-1 text-right font-mono text-sm hover:border-zinc-300 dark:hover:border-zinc-700"
        >
          {row.points}
        </button>
      )}
      <button
        onClick={() => onHistory(row)}
        title="변경 이력"
        className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-500 dark:border-zinc-800"
      >
        이력
      </button>
    </li>
  );
}

function ScoreHistoryModal({
  row,
  onClose,
}: {
  row: ScoreRow;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<ScoreLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const { logs } = await jsonFetch<{ logs: ScoreLog[] }>(
          `/api/scores/logs?score_id=${row.id}`,
        );
        if (!aborted) setLogs(logs);
      } catch (e) {
        if (!aborted) setError(e instanceof Error ? e.message : "조회 실패");
      }
    })();
    return () => {
      aborted = true;
    };
  }, [row.id]);

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">변경 이력</h3>
            <p className="mt-1 text-xs text-zinc-500">
              <span className="font-mono">{row.sid}</span> · {row.game_name} · 현재{" "}
              <span className="font-mono">{row.points}</span>점
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
          >
            닫기
          </button>
        </div>
        <div className="mt-3 max-h-80 overflow-y-auto">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!error && logs === null && (
            <p className="text-sm text-zinc-500">불러오는 중...</p>
          )}
          {logs && logs.length === 0 && (
            <p className="text-sm text-zinc-500">이력이 없습니다.</p>
          )}
          {logs && logs.length > 0 && (
            <ol className="space-y-2">
              {logs.map((l) => (
                <li
                  key={l.id}
                  className="rounded border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono">
                      {l.old_points ?? "—"} → {l.new_points}
                    </span>
                    <span className="text-zinc-500">
                      {new Date(l.changed_at).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <div className="mt-0.5 text-zinc-500">{l.changed_by}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreAddModal({
  games,
  onClose,
  onSaved,
  flash,
}: {
  games: GameRow[];
  onClose: () => void;
  onSaved: () => void;
  flash: (k: "ok" | "err", t: string) => void;
}) {
  const [gameName, setGameName] = useState(games[0]?.name ?? "");
  const [sid, setSid] = useState("");
  const [points, setPoints] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!gameName || !/^[1-9]\d{4}$/.test(sid)) {
      flash("err", "게임 선택 + 5자리 번호 필요");
      return;
    }
    const n = parseInt(points, 10);
    if (!Number.isInteger(n)) {
      flash("err", "점수는 정수");
      return;
    }
    setBusy(true);
    try {
      await jsonFetch("/api/scores", {
        method: "POST",
        body: JSON.stringify({ gameName, sid, points: n }),
      });
      flash("ok", "점수 저장됨");
      onSaved();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900">
        <h3 className="text-base font-semibold">점수 수동 추가</h3>
        <div className="mt-3 space-y-2">
          <select
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {games.map((g) => (
              <option key={g.id} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>
          <input
            value={sid}
            onChange={(e) => setSid(e.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="개인식별번호 (5자리)"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-center font-mono tracking-[0.3em] dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            value={points}
            onChange={(e) => setPoints(e.target.value.replace(/[^\d-]/g, ""))}
            inputMode="numeric"
            pattern="-?[0-9]*"
            placeholder="점수"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-center font-mono dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Students ----------
type StudentRow = {
  sid: string;
  grade: number;
  class_no: number;
  student_no: number;
  has_scores: boolean;
};

type BulkResult = {
  inserted: string[];
  skipped: string[];
  invalid: string[];
};

function StudentsSection({
  flash,
  reloadKey,
}: {
  flash: (k: "ok" | "err", t: string) => void;
  reloadKey: number;
}) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [singleSid, setSingleSid] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [lastBulk, setLastBulk] = useState<BulkResult | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { students } = await jsonFetch<{ students: StudentRow[] }>("/api/students");
      setStudents(students);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "학생 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  async function addSingle() {
    if (!/^[1-9]\d{4}$/.test(singleSid)) {
      flash("err", "5자리 숫자, 첫자리 1-9");
      return;
    }
    try {
      const result = await jsonFetch<BulkResult>("/api/students", {
        method: "POST",
        body: JSON.stringify({ sid: singleSid }),
      });
      if (result.inserted.length > 0) {
        flash("ok", `${singleSid} 등록됨`);
        setSingleSid("");
        load();
      } else if (result.skipped.length > 0) {
        flash("err", `${singleSid}는 이미 등록된 학생입니다.`);
      } else {
        flash("err", "등록 실패");
      }
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "등록 실패");
    }
  }

  async function addBulk() {
    const sids = bulkText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (sids.length === 0) {
      flash("err", "등록할 번호가 없습니다.");
      return;
    }
    setBulkBusy(true);
    try {
      const result = await jsonFetch<BulkResult>("/api/students", {
        method: "POST",
        body: JSON.stringify({ sids }),
      });
      setLastBulk(result);
      const msg = `등록 ${result.inserted.length} · 기존 ${result.skipped.length} · 무효 ${result.invalid.length}`;
      flash("ok", msg);
      if (result.inserted.length > 0) setBulkText("");
      load();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "일괄 등록 실패");
    } finally {
      setBulkBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setBulkText((prev) => (prev ? prev + "\n" + text : text));
    e.target.value = "";
  }

  async function del(row: StudentRow) {
    const warn = row.has_scores
      ? `${row.sid}는 이미 점수가 등록된 학생입니다. 삭제하면 모든 점수/로그가 함께 삭제됩니다. 계속할까요?`
      : `${row.sid}를 삭제할까요?`;
    if (!confirm(warn)) return;
    try {
      await jsonFetch(`/api/students/${row.sid}`, { method: "DELETE" });
      flash("ok", `${row.sid} 삭제됨`);
      load();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "삭제 실패");
    }
  }

  const filtered = filter.trim()
    ? students.filter((s) => s.sid.includes(filter.trim()))
    : students;

  const grouped: Array<{ grade: number; classNo: number; rows: StudentRow[] }> = [];
  for (const s of filtered) {
    const last = grouped[grouped.length - 1];
    if (last && last.grade === s.grade && last.classNo === s.class_no) {
      last.rows.push(s);
    } else {
      grouped.push({ grade: s.grade, classNo: s.class_no, rows: [s] });
    }
  }

  return (
    <section className="mt-8 mb-12">
      <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-zinc-500">
        <span>학생 관리</span>
        <span className="text-xs font-normal">전체 {students.length}명</span>
      </h2>

      <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400">
          수기 추가 (5자리)
        </label>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={5}
            value={singleSid}
            onChange={(e) => setSingleSid(e.target.value.replace(/\D/g, "").slice(0, 5))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && singleSid.length === 5) addSingle();
            }}
            placeholder="예: 10211"
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-center font-mono tracking-[0.3em] outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
          />
          <button
            onClick={addSingle}
            disabled={singleSid.length !== 5}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            추가
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <label className="flex items-center justify-between text-sm font-medium text-zinc-600 dark:text-zinc-400">
          <span>일괄 등록 (줄바꿈/쉼표로 구분)</span>
          <span className="cursor-pointer text-xs text-zinc-500 underline">
            <input
              type="file"
              accept=".csv,.txt,text/plain,text/csv"
              onChange={onFile}
              className="hidden"
              id="students-csv"
            />
            <label htmlFor="students-csv" className="cursor-pointer">
              CSV 불러오기
            </label>
          </span>
        </label>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={"10211\n10212\n10213 ..."}
          rows={4}
          className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">
            형식 GCCNN — 학년(1) + 반(01-99) + 번호(01-99).
          </p>
          <button
            onClick={addBulk}
            disabled={bulkBusy || bulkText.trim().length === 0}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {bulkBusy ? "등록 중..." : "일괄 등록"}
          </button>
        </div>
        {lastBulk && (lastBulk.skipped.length > 0 || lastBulk.invalid.length > 0) && (
          <div className="mt-2 space-y-1 text-xs">
            {lastBulk.skipped.length > 0 && (
              <div className="text-zinc-500">
                기존 {lastBulk.skipped.length}건:{" "}
                <span className="font-mono">{lastBulk.skipped.slice(0, 20).join(", ")}</span>
                {lastBulk.skipped.length > 20 && " ..."}
              </div>
            )}
            {lastBulk.invalid.length > 0 && (
              <div className="text-red-600 dark:text-red-400">
                무효 {lastBulk.invalid.length}건:{" "}
                <span className="font-mono">{lastBulk.invalid.slice(0, 20).join(", ")}</span>
                {lastBulk.invalid.length > 20 && " ..."}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="번호 검색"
          className="mb-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <div className="max-h-96 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          {loading && (
            <div className="p-4 text-center text-sm text-zinc-500">불러오는 중...</div>
          )}
          {!loading && grouped.length === 0 && (
            <div className="p-4 text-center text-sm text-zinc-500">
              {students.length === 0 ? "등록된 학생이 없습니다." : "검색 결과가 없습니다."}
            </div>
          )}
          {grouped.map((g) => (
            <div key={`${g.grade}-${g.classNo}`}>
              <div className="sticky top-0 border-b border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                {g.grade}학년 {String(g.classNo).padStart(2, "0")}반 · {g.rows.length}명
              </div>
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {g.rows.map((r) => (
                  <li
                    key={r.sid}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
                  >
                    <span className="font-mono">
                      {r.sid}
                      <span className="ml-2 text-xs text-zinc-500">
                        {r.grade}-{String(r.class_no).padStart(2, "0")}-
                        {String(r.student_no).padStart(2, "0")}
                      </span>
                      {r.has_scores && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          점수 있음
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => del(r)}
                      className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 dark:border-red-900 dark:text-red-300"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Settings ----------
function SettingsSection({
  flash,
}: {
  flash: (k: "ok" | "err", t: string) => void;
}) {
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [rankLimit, setRankLimit] = useState<string>("");
  const [rankBusy, setRankBusy] = useState(false);

  const loadRank = useCallback(async () => {
    try {
      const { value } = await jsonFetch<{ value: number }>(
        "/api/settings/personal-rank-limit",
      );
      setRankLimit(String(value));
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "설정 조회 실패");
    }
  }, [flash]);

  useEffect(() => {
    loadRank();
  }, [loadRank]);

  async function save() {
    if (!/^\d{6}$/.test(pw)) {
      flash("err", "6자리 숫자");
      return;
    }
    setSaving(true);
    try {
      await jsonFetch("/api/settings/teacher-password", {
        method: "POST",
        body: JSON.stringify({ password: pw }),
      });
      setPw("");
      flash("ok", "선생님 비밀번호 저장됨");
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "실패");
    } finally {
      setSaving(false);
    }
  }

  async function saveRank() {
    const n = parseInt(rankLimit, 10);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      flash("err", "1~1000 사이 정수");
      return;
    }
    setRankBusy(true);
    try {
      await jsonFetch("/api/settings/personal-rank-limit", {
        method: "POST",
        body: JSON.stringify({ value: n }),
      });
      flash("ok", `개인 순위 표시 ${n}명으로 저장됨`);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "실패");
    } finally {
      setRankBusy(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-semibold text-zinc-500">설정</h2>
      <div className="space-y-3">
        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400">
            선생님 공통 비밀번호 (6자리)
          </label>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="off"
              value={pw}
              onChange={(e) => setPw(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="· · · · · ·"
              className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-center font-mono tracking-[0.4em] outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
            />
            <button
              onClick={save}
              disabled={saving || pw.length !== 6}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              저장
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            저장 즉시 모든 선생님 로그인에 적용됩니다. 기존 로그인 세션은 유지됩니다.
          </p>
        </div>

        <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400">
            개인 순위 표시 인원
          </label>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={rankLimit}
              onChange={(e) => setRankLimit(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="예: 20"
              className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-center font-mono outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
            />
            <button
              onClick={saveRank}
              disabled={rankBusy || !rankLimit}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              저장
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            학생 대시보드 개인 순위 탭에 상위 N명만 표시됩니다. (1~1000)
          </p>
        </div>
      </div>
    </section>
  );
}
